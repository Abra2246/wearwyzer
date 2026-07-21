# WearWyzer — Architecture

This describes the system as it exists today, and the incremental path toward the multi-feature platform described in the product roadmap. It intentionally avoids proposing a rewrite — see `ENGINEERING_AUDIT.md` for how we got here.

## Current architecture (as-is)

```
Browser
 └── loads a .dc.html page
      ├── renders inline-styled template
      ├── controller class holds page-local UI state (search text, active filters, form state)
      └── dynamic import() pulls content from js/site-data.js, js/guides.js, js/products.js
```

No network calls beyond font/image loads. No server. No build step. Every page is independently viewable.

Shared UI (`Site Nav.dc.html`, `Site Footer.dc.html`) is composed into every page via `<dc-import>` — this is the one form of real componentization in the codebase today, and it works well.

## Recommendation 1 — Guide pages: template + router, not copy-pasted files
**Current state:** each style guide is a fully duplicated `.dc.html` file; only a `GUIDE_ID` constant and the `<helmet>` meta differ.
**Problem:** a bug fix or design change to the guide layout must be manually re-applied to every guide file. This is already a manual chore at 3 guides and becomes untenable past ~15–20.
**Proposed solution:** introduce one `guide-template.dc.html` that reads `?guide=<id>` (or a path segment, once real routing/hosting exists) and renders any guide from `js/guides.js`. Keep today's per-guide files only as thin redirects for existing bookmarked/shared URLs, or drop them once URLs can be rewritten at the host level.
**Benefit:** new guides become a pure data change — no new template file, no risk of the copies drifting apart.
**Migration effort:** Low–Medium. The guide template logic already reads everything from `js/guides.js`; the only work is parameterizing `GUIDE_ID` from the URL instead of hardcoding it, and deciding on a routing strategy for the static host.
**Priority: High.**

## Recommendation 2 — Move content ownership off hand-edited JS files
**Current state:** guides/products/prices/affiliate links are edited directly in `js/*.js` by whoever has repo access.
**Problem:** doesn't scale past one or two content editors; no validation (a broken `productId` reference fails silently), no history, no draft/review step before publishing.
**Proposed solution:** introduce a headless CMS or a lightweight custom admin (this is the "Editorial CMS" from the roadmap) that writes to a real database, with `js/guides.js`/`products.js` regenerated from it (or replaced by an API call) at build or request time.
**Benefit:** unlocks multi-person content ops, an audit trail, and is the prerequisite for Product/Brand/Merchant Intelligence and the Affiliate Engine (none of which can exist as flat JS files).
**Migration effort:** High — this is genuine backend work (database schema, API, auth, admin UI), not a front-end change.
**Priority: High, but sequenced after Recommendation 1** (no reason to build a CMS around a content shape that's about to change).

## Recommendation 3 — Real search
**Current state:** substring match over an array already downloaded to the browser.
**Problem:** fine today; breaks down as the catalog grows past what's reasonable to ship in every page load, and can't support the roadmap's "Product Search" as a first-class feature (ranking, typo tolerance, faceting at scale).
**Proposed solution:** once there's a real backend/database (Recommendation 2), move search to a server-side index (Postgres full-text to start; a dedicated search service like Meilisearch/Algolia only if/when catalog size and query volume justify it).
**Benefit:** search that scales with catalog size instead of page-load size.
**Migration effort:** Medium, but blocked on Recommendation 2 existing first.
**Priority: Medium.**

## Recommendation 4 — Affiliate Engine as a real system, not a field on a product object
**Current state:** `affiliateUrl` is a single hardcoded string per product.
**Problem:** can't represent multiple retailers per product, can't track clicks, can't rotate/expire links, can't attribute revenue per guide.
**Proposed solution:** a `retailers` table (product → many retailer offers, each with its own URL/price/status) plus a redirect endpoint (`/go/:offerId`) that logs the click before forwarding — this is the actual foundation of an "Affiliate Engine" and of any future Analytics Dashboard.
**Benefit:** real attribution data, multi-retailer comparison, and a single place to update/rotate links instead of scattering them across data files (this also directly satisfies "no hardcoded affiliate links scattered across HTML," which is already true today — links live in `js/products.js`, not in markup — but should stay true as the system grows).
**Migration effort:** Medium once a backend exists; High if attempted before one does.
**Priority: High, once Recommendation 2 lands.**

## Recommendation 5 — AI Stylist / Outfit Builder / Closet / Wishlist
**Current state:** none of these exist in any form; guides are hand-authored outfit combinations, not a queryable outfit graph.
**Problem:** these features need (a) a real Product Intelligence database with structured attributes (color, category, formality, season) and (b) a real Outfit Intelligence database describing which items combine and why — neither exists yet.
**Proposed solution:** do not start here. These features are downstream of Recommendations 1–4. Trying to build an AI Stylist on top of three flat JS files would mean rebuilding it again the moment a real database exists.
**Priority: Low for now** — explicitly sequenced last in `ROADMAP.md`.

## Decision — Hero Product page (issue #14, Knowledge Graph v1 vertical slice)
**Current state:** `products.dc.html` shows every covered product inline on one index page; there is no dedicated per-product URL (`ROADMAP.md` Milestone 4, "Product & Brand pages," lists this as **Missing** and explicitly sequences it after Milestone 3 — a real database + API — because a real product/brand/search platform can't be honestly built on three flat JS files).
**Problem / scope note:** issue #14 asked for a first customer-facing product page built from the additive Knowledge Graph (`data/*.js`, issue #12) *without* a backend, database, or framework migration — a narrower slice than Milestone 4's "real search endpoint, first-class brand pages" scope. This is a deliberate exception, not a decision to skip the Milestone 3 → 4 sequencing: it ships exactly one static, read-only page (`product-nb-9060-breakfast-tea.dc.html`) reading `data/*.js` the same way every other page reads `js/products.js`/`js/guides.js` today — no new data-ownership model, no server, no routing. **A human reviewer should confirm this reading of scope before merging** — if the intent was to wait for Milestone 3, this PR should be re-scoped or closed instead.
**Proposed solution (what shipped):** one reusable hero-product template + one live page, a hand-authored `js/hero-pages.js` routing registry (product id → page file, the only viable "routing" on a backend-free static host), and `scripts/validate-hero-product-pages.mjs` to keep the registry and the graph's recommendation-eligibility gate (`isPubliclyRecommendable()`) from silently drifting. See `docs/HERO_PRODUCT_V1.md` for the hero-product selection audit and exactly which relationships the page renders.
**Benefit:** proves the Knowledge Graph v1 foundation (issue #12) can drive real, customer-facing rendering — including its confidence/verification gating — before any backend investment, and gives Milestone 4 a concrete existing page to generalize into a real template/router rather than designing one from scratch.
**Migration effort:** Low today (one static page, additive). Migrating *this* page into Milestone 4's eventual `/products/:slug` router is expected to be small specifically because it already reads from `data/*.js` instead of the legacy files — see `docs/KNOWLEDGE_GRAPH_MIGRATION.md` Phase 3.
**Priority:** N/A — already shipped as a scoped exception; do not use this as precedent for building further product pages ahead of Milestone 3 without the same explicit issue-level scoping.

## Decision — Autonomous Site and Guide Factory v1 (issue #17)
**Current state:** issue #16 built a general-purpose autonomous engineering queue (select → dispatch → validate → guarded merge) operating on GitHub issues. Guide creation itself was still entirely manual — an editor hand-authors a guide object in `js/guides.js`, a matching `.dc.html` page, and a sitemap entry.
**Problem / scope note:** this epic asks for a deterministic pipeline that can take a versioned, machine-readable "guide job manifest" and produce a validated, PR-ready guide — without ever fabricating a product/price/affiliate fact, without a paid image-generation credential, and without writing directly to the live site's content files. That last constraint is a deliberate scope boundary, not an oversight: see `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` "Why the CLI doesn't write site files yet."
**Proposed solution (what shipped):** `scripts/guide-manifest-schema.mjs` (schema + fact/duplication/staleness validation), `scripts/guide-factory.mjs` (pure pipeline orchestration), `scripts/guide-renderer-adapter.mjs` (deterministic SVG rendering by default; an inert, credential-gated external-provider interface for later), `scripts/content-quality-policy.mjs` (editorial/diversity/asset checks), `scripts/guide-page-template.mjs` (one reusable `.dc.html` template — a narrower, guide-factory-scoped instance of Recommendation 1's "template, not copy-pasted files" idea, not a retrofit of the existing three guide pages), plus deployment health/rollback (`scripts/deploy-health-check.mjs`, `scripts/rollback.mjs`) and a notification-by-exception contract (`scripts/notify-exception.mjs`, `scripts/status-log.mjs`) layered on top of issue #16's existing queue (`scripts/queue-rules.mjs`'s `canDispatch()` now also suspends on an open `site-incident` issue). See that doc for the full spec.
**Benefit:** a guide can go from an editor-approved manifest to a validated, evidence-backed PR without a human relaying prompts through a terminal — while every fact-integrity and risk-tier rule this repo already enforces for hand-authored content (`CLAUDE.md`, `docs/AUTONOMOUS_ENGINEERING_V1.md`) still applies identically to automated output.
**Migration effort:** the pipeline is additive and does not touch `js/guides.js`/`js/products.js`/any existing page. Wiring its `ready-for-pr` output into an actual file write + PR is deliberately left as a small, mechanical follow-up (see the doc) rather than done here against fabricated content.
**Priority:** N/A — shipped as scoped by issue #17. Still stops before merge (high risk, per the issue's own risk tier) and does not activate any new scheduled workflow (`.github/workflows/` is outside this change's permitted scope — see `docs/AUTOMATION_WORKFLOW.md` activation checklist).

## Decision — Automation completion handoff watchdog (issue #22)
**Current state:** issue #16's queue moves an issue from `in-progress` to `review` only when a PR already exists and fires a webhook (`scripts/queue-pr-state.mjs sync`). On issues #16 and #17, the implementation run finished and pushed a branch, but the completion comment only linked a "create a PR" URL rather than opening one — so both issues sat `in-progress` for hours until a maintainer noticed and opened the PR by hand (and, for #17, separately noticed and promoted its staged workflow files).
**Problem / scope note:** there was no mechanism watching for "implementation finished, nothing happened next." This is a repair/escalation loop layered on top of the existing queue, not a redesign of it.
**Proposed solution (what shipped):** `scripts/handoff-watchdog-rules.mjs` (pure decision logic), extensions to `scripts/queue-github-client.mjs` (branch discovery, PR-by-branch, diff, create-PR), and `scripts/handoff-watchdog.mjs` (the orchestrator). For every `in-progress` + `automation-managed` issue: discover its `claude/issue-<N>-*` branch, and once a grace period (15 minutes) elapses with no PR opened, open one itself as a draft and move the issue to `review`; if the branch stages any file under `docs/automation/workflows/`, flag it with one precise maintainer comment regardless of grace period or PR state; if no branch and no PR exist at all, mark `automation-failed` + `needs-human`. Every action is idempotent via HTML-comment markers scanned from the issue's own comments. See `docs/AUTOMATION_HANDOFF_WATCHDOG_V1.md` for the full contract.
**Benefit:** an issue can no longer stay falsely `in-progress` indefinitely after its implementation run has actually finished — the exact failure this epic exists to close, reproduced as regression fixtures for #16 and #17's real branch/file shapes.
**Migration effort:** Low — additive scripts plus one staged workflow file; no change to `scripts/queue-rules.mjs`'s existing PR-sync/auto-merge logic, which still owns everything once a non-draft PR exists.
**Priority:** N/A — shipped as scoped by issue #22 (medium risk). Stops before merge; does not activate any new scheduled workflow (`.github/workflows/` is outside this change's permitted scope — see `docs/AUTOMATION_WORKFLOW.md` activation checklist).

## Decision — OpenAI Images API renderer pilot (issue #18)
**Current state:** issue #17 shipped a deterministic SVG renderer as the guide factory's only
working slide renderer, plus an inert `external-provider` interface in
`scripts/guide-renderer-adapter.mjs` that always reports `blocked` because no image-generation
credential or implementation existed yet — a deliberate scope boundary at the time, not a gap.
**Problem / scope note:** this epic asks for a real, paid, external generative image provider
(OpenAI Images API) wired in for editorial/outfit photography specifically, while keeping every
piece of final typography (headlines, prices, product lists, logos, slide numbers) deterministic
— never asking the image model to typeset the carousel — and never accepting a generated image
automatically without either a real vision-QA pass (not available in this dependency-free repo)
or a human review step.
**Proposed solution (what shipped):** `scripts/openai-image-provider.mjs` (fail-closed adapter,
env-only key, never logged), `scripts/openai-prompt-compiler.mjs` (versioned, editorial-imagery-
only prompts — a separate `compileFinalLayoutPrompt()` exists solely to assert that layer never
goes to the image model), `scripts/openai-cost-controls.mjs` (budget/attempt/backoff gating
against the approved pilot defaults — $0.30/guide, $30/month, 2 attempts, 3 accepted images),
`scripts/reference-preservation-check.mjs` (conservative rule-based QA that defaults every
pixel-level category to `needs-human` rather than guess, since no vision-model dependency exists
here — a documented, honest limitation with a clear extension point), `scripts/openai-asset-
pipeline.mjs` (checksummed, separately-pathed source vs. final assets), and
`scripts/openai-hybrid-renderer.mjs` — the async orchestration layer that produces the exact
same `{ slideOrder, mode, format, status, content }` shape `scripts/guide-renderer-adapter.mjs`'s
existing synchronous `renderSlides()` does. That adapter's own design (issue #17) is
intentionally synchronous and network-free, and every existing test assumes a plain synchronous
return value, so this epic does not force async network I/O through it; instead
`scripts/guide-factory.mjs`'s `runGuideFactoryJob` gained one additive parameter
(`precomputedRenderedAssets`, default `null`) so a caller can supply hybrid-rendered assets
through the identical downstream contract (content quality policy, asset naming/existence) —
same consumer, same gates, different (necessarily async) producer. See
`docs/OPENAI_IMAGE_RENDERER_V1.md` for the full spec.
**Benefit:** a real generative-imagery path exists behind every safety property the epic asked
for — fail-closed credentials, cost/rate caps, conservative visual QA, deterministic final
typography — without touching a single existing test or the guide factory's synchronous
contract.
**Migration effort:** additive throughout. Wiring a real vision-model review pass to replace the
conservative `needs-human` default in `reference-preservation-check.mjs` is a deliberately
separate future decision — the `visionSignals` extension point already exists for it.
**Priority:** N/A — shipped as scoped by issue #18 (high risk, per the issue's own risk tier).
Stops before merge; the pilot ran in simulation only (an injected fake provider, $0 real spend,
no real network call — this environment's own permitted tool allowlist has no egress to
`api.openai.com` regardless); does not activate any new scheduled workflow (`.github/workflows/`
is outside this change's permitted scope — see `docs/AUTOMATION_WORKFLOW.md` activation
checklist).

## Decision — Style Guides folder importer v1 (issue #34)
**Current state:** issue #17 shipped a deterministic guide-manifest → PR pipeline (the guide
factory) but no way to feed it from anything other than a hand-authored manifest;
`automation/guide-jobs/` ships intentionally empty. Issue #34 asked to import a `Style Guides`
source folder into that pipeline.
**Problem / scope note:** the actual inventory (run before any conversion code was written —
working tree, `git log --all`, and every one of this repo's 19 branches) found **no directory
named `Style Guides` (or any variant) anywhere in this repository — 0 files, 0 formats.**
Fabricating source content to demonstrate an importer would violate `CLAUDE.md`'s
content-integrity rule the same way inventing a guide manifest would have for issue #17, so
this change ships the importer as real, tested infrastructure proven against an isolated
fixture universe instead of against invented "real" content. See
`docs/STYLE_GUIDE_IMPORTER_V1.md` §1 for the full inventory finding and evidence.
**Proposed solution (what shipped):** `scripts/style-guide-importer.mjs` (pure: format
classification, structured-source → draft-manifest conversion, exact-duplicate check against
canonical `js/guides.js`, and full validation reusing `scripts/guide-manifest-schema.mjs`
verbatim) plus `scripts/style-guide-importer-cli.mjs` (the only I/O: scans the real `Style
Guides/` directory if one ever exists, writes `status: "draft"` manifests to
`automation/guide-jobs/` — never `"approved"`, matching that directory's existing
human-promotion lifecycle — and a provenance/disposition report to
`automation/status/style-guide-import-report.json`). `scripts/simulate-style-guide-import.mjs`
proves the importer's draft-manifest output composes end-to-end with the existing guide
factory. Does **not** add a new `data/*.js` write path — see that doc §6 for why doing so here
would jump `docs/KNOWLEDGE_GRAPH_MIGRATION.md`'s explicit Phase 0 → Phase 1 sequencing.
**Benefit:** the moment a real `Style Guides` folder is added, running the CLI does real,
useful, non-destructive work against it (classify, dedup, draft, report) with zero further
code changes for the common cases — while every fact-integrity rule this repo already enforces
for hand-authored or guide-factory-generated content applies identically to imported content.
**Migration effort:** additive; does not touch `js/guides.js`, `js/products.js`, `data/*.js`,
any `.dc.html` page, or any existing asset under `assets/images/guides/`.
**Priority:** N/A — shipped as scoped by issue #34 (high risk, per the issue's own risk tier).
Stops before merge; no real source content existed to import, so no draft manifest was
actually written to `automation/guide-jobs/` in this repository as of this change (confirmed by
running the CLI live — see `docs/STYLE_GUIDE_IMPORTER_V1.md` §8); does not activate any new
scheduled workflow.

## Decision — Mission Control ops dashboard v1 (issue #19)
**Current state:** issues #16/#17/#18/#22 built a substantial automation stack (engineering
queue, guide factory, deploy health/rollback, OpenAI renderer + spend ledger, completion
handoff watchdog), but the only way to see its current state is reading GitHub issues, PRs,
and workflow logs directly — there is no single, fast, mobile-usable view of "is everything
okay right now?"
**Problem / scope note:** the issue asks for a **read-only** dashboard — it must never
expose secrets, private logs, or raw issue/PR content, and must never merge, deploy,
publish, or otherwise control anything. It also has no real access control (unauthenticated
static hosting), so what's safe to put in the status artifact is itself a security decision,
not just a UI one.
**Proposed solution (what shipped):** `scripts/ops-status-schema.mjs` (a *closed*-shape
schema — every nested object rejects unknown keys — plus a secret-like-value scanner) and
`scripts/ops-status-builder.mjs` (pure assembly from already-sanitized inputs) are the
security boundary; `scripts/ops-status-cli.mjs` (the only I/O) refuses to write
`ops/status.json` if either check fails. `ops.dc.html` is the dashboard: mobile-first cards,
a green/amber/red health hero, 60-second polling with client-side staleness detection,
`noindex, nofollow` plus a `robots.txt` disallow, and no link from public navigation. See
`docs/OPS_DASHBOARD_V1.md` for the full contract.
**A deliberate architectural exception:** `docs/automation/workflows/ops-status-refresh.yml`
(staged) is the one workflow in this repo's automation stack with `contents: write` that
commits directly to `main`, bypassing the issue → PR → review flow every other automated
change here goes through. This repo has no backend and no build step (`CLAUDE.md`), so a
statically-hosted page can only read fresh data from a committed file — there was no way to
satisfy "the dashboard renders real data" without either this exception or a backend, and a
backend is explicitly out of scope for a v1 observability page. The exception is scoped as
narrowly as possible: one generated JSON file, gated by the schema/secret-scan check above,
called out explicitly in the workflow's own header for a maintainer to review before
activating.
**Benefit:** the CEO (or any maintainer) can check automation health from a phone in under
10 seconds without opening GitHub, while every fact this dashboard surfaces is provably
sanitized by the same schema that would refuse to let a secret or raw log line reach the
committed artifact in the first place.
**Migration effort:** additive; does not touch any existing page, `js/guides.js`,
`js/products.js`, or `data/*.js`. `robots.txt` gained two `Disallow` lines.
**Priority:** N/A — shipped as scoped by issue #19 (medium risk). Stops before merge; does
not activate the new scheduled workflow (`.github/workflows/` is outside this change's
permitted scope — see `docs/AUTOMATION_WORKFLOW.md` activation checklist, which also flags
the `contents: write` exception above for explicit maintainer sign-off).

## Decision — Verified supporting-item link engine v1 (issue #24)
**Current state:** Recommendation 4 above (a real `retailers`/`offers` backend, click
tracking, revenue attribution) remains unbuilt and correctly sequenced behind `ROADMAP.md`
Milestone 3. Affiliate coverage reporting existed only as `content-quality-policy.mjs`'s
`reportAffiliateCoverage()` — a simple "has *a* link, yes/no" count with no verification
that the link is still live, still the right product, or still affiliate-eligible.
**Problem / scope note:** issue #24 asks for a system that discovers, verifies, scores,
and publishes supporting-item product links without fabricating availability, price,
retailer, or affiliate status, and measures affiliate coverage against an explicit 80–90%
operating target. Same deliberate, narrowly-scoped-exception shape as issue #14's Hero
Product page: built entirely on the additive Knowledge Graph (`data/*.js`) and
deterministic in-memory fixtures, with no backend, no database, no live retailer/affiliate
credential, and no wiring into `data/offers.js` or any `.dc.html` page. See
`docs/LINK_ENGINE_V1.md` "Scope note" for the full reasoning.
**Proposed solution (what shipped):** `scripts/link-engine-adapters.mjs` (provider-agnostic
adapter contract — deterministic fixture adapters plus a permanently-inert
credential-gated `http-provider` stub, same inert-until-configured pattern as
`scripts/openai-image-provider.mjs`), `scripts/link-engine-matcher.mjs` (weighted
candidate scoring — exact/ambiguous/no-match classification, never an auto-picked weak
match), `scripts/link-engine-verifier.mjs` (turns one adapter snapshot into a timestamped,
`linkStatus`-classified verified offer, with canonical/retailer/affiliate URLs always kept
as three distinct fields), `scripts/link-engine.mjs` (pure pipeline orchestration —
exact-match-first with clearly-labeled, structurally-approved alternative substitution
only once the exact item is confirmed unavailable, plus scheduled-revalidation
remove/replace/flag logic), and `scripts/link-engine-coverage.mjs` (the 80–90%
target, per-guide/portfolio coverage math, and explicit threshold-shortfall logging with
sourcing-priority recurrence tracking). `scripts/link-engine-cli.mjs` is the only I/O —
same "why the CLI doesn't write site files yet" boundary as the guide factory.
`scripts/ops-status-schema.mjs`/`ops-status-builder.mjs` gained a closed `linkEngine`
section so per-guide/portfolio coverage and the 80–90% target are visible on Mission
Control (issue #19), downgrading `overallHealth` to yellow when coverage is below target.
See `docs/LINK_ENGINE_V1.md` for the full spec.
**Benefit:** a tested, deterministic matching/verification/coverage algorithm exists and is
proven correct against every named failure mode (ambiguous match, dead link, redirect,
stale price, out-of-stock, mismatched identity, affiliate-eligibility loss, duplicate
offer) before any backend investment — so Milestone 5's eventual real Affiliate Engine has
an algorithm to sit behind rather than being designed from scratch once a database exists,
exactly the role issue #14's Hero Product page played for Milestone 4.
**Migration effort:** additive; does not touch `data/offers.js`, `js/products.js`, or any
existing page. Wiring a real provider adapter (once a live retailer/affiliate-network
credential is available) and pointing `scripts/link-engine-cli.mjs` at real product data
instead of read-only Knowledge Graph projections is expected to be small specifically
because the matching/verification/coverage algorithm itself needs no changes.
**Priority:** N/A — shipped as scoped by issue #24 (high risk — external commerce data and
customer-facing claims). Stops before merge; does not activate the staged revalidation
workflow (`.github/workflows/` is outside this change's permitted scope — see
`docs/AUTOMATION_WORKFLOW.md` activation checklist).

## Decision — Secure affiliate connector boundary (issue #25)
**Current state:** issue #24 ships a provider-agnostic supporting-item link engine,
but its real HTTP adapters are deliberately inert. There is no approved mechanism for
supplying affiliate credentials, validating scopes, rotating tokens, or reporting a
provider's connection health without risking secret leakage.

**Proposed solution:** add a dependency-free connector contract whose provider
definitions contain only safe metadata. Runtime secret resolvers inject credentials
from named environment secrets directly into an injected provider transport; connection
results, audit events, and Mission Control projections are closed, sanitized shapes that
never contain credential values or account identifiers. OAuth and static-secret providers
share explicit sandbox/production isolation, least-privilege scope policy, expiry and
revocation states, and rotation-without-code-change semantics. The framework remains
transport-injected and fixture-tested until the CEO approves a real provider/account.

**Benefit:** real network adapters can be added behind issue #24's existing product/link
contract without teaching the content pipeline how credentials work, while one failed or
expired provider degrades only itself and creates one actionable `needs-human` status.

**Migration effort:** additive. No live account, provider OAuth application, repository
secret, product link, payout setting, or customer-facing page changes in v1.

**Priority:** P1 after Mission Control issue #42 reaches review; high risk, mandatory
security review before any production credential is connected.

## Decision — Mission Control v2 live-data layer (issue #42, Phase 1 + 2)
**Current state:** Mission Control v1 (issue #19) is a real, working snapshot dashboard, but
it is snapshot-first: one blended `overallHealth` computed from a single `generatedAtIso` on
a 15-minute schedule. That conflates "is the system healthy" with "is this specific field's
data still trustworthy right now" into one number — a stale generator can still read as
green. Issue #42 asks for a dashboard that queries current state wherever safely possible,
makes unknown/delayed/offline states explicit per source ("no fake green"), and adds a
business-readable automation event timeline.
**Problem / scope note:** this repo remains front-end-only with no backend (`CLAUDE.md`), and
a browser cannot safely hold a GitHub token or survive unauthenticated GitHub API rate limits
at a 30-60s poll cadence. The issue names two acceptable secure-aggregation shapes: a GitHub
Actions-generated compact live feed, or a least-privilege serverless endpoint with caching.
**Proposed solution (what shipped):** extended v1's already-proven "generated JSON committed
by a scheduled workflow" pattern rather than introducing a new serverless deployment target —
same closed-shape-schema-plus-secret-scanner security boundary, applied to a new, additive
document. `scripts/ops-live-schema.mjs`/`scripts/ops-live-builder.mjs` model each wired source
(`engineering`, `deployment`) with its own `live`/`delayed`/`offline` state derived from how
long ago that source was *last successfully queried* — decoupled from how long ago the
underlying event happened, so a quiet deployment reads as healthy while a generator that's
actually lost GitHub API access reads as offline, never the reverse. A failed fetch preserves
the previous run's data as last-known-good while `lastUpdatedIso` stops advancing, so staleness
is a pure function of time rather than a binary has-data/no-data flag. `overallState` is the
worst of the two critical sources only; not-yet-wired `content`/`image`/`affiliate` (Phase 3)
report an honest `not-wired` state that never drags the aggregate down or fakes a default.
The automation feed merges `automation/status/events.jsonl` with freshly observed GitHub state
(active issue, PR, CI runs, merged PRs, deployments) by a stable per-resource key, making it
idempotent across repeated 5-minute generator runs without needing to diff old vs. new state.
`scripts/ops-live-cli.mjs` is the only I/O, reusing `scripts/queue-github-client.mjs` (extended
with `getPullRequestReviewDecision`, `listRecentlyMergedPullRequests`,
`listRecentWorkflowRuns`, `getLatestPagesDeployment` — no new secret). `mission-control.dc.html`
is the v2 page: a header Live/Updating/Delayed/Offline indicator that combines client-side poll
connectivity with the fetched document's own `overallState` (so a successful poll of stale data
still shows Delayed, not Live), a CEO summary card, Engineering/Deployment source cards with
click-through links, honest "Not wired" Phase 3 placeholders, and the automation feed. See
`docs/OPS_DASHBOARD_V2.md` for the full contract.
**Benefit:** the CEO (or any maintainer) gets an honest, per-source-accurate live view instead
of one blended number that can mask a specific stale/failing source, plus a real timeline of
what automation did — while v1 keeps running unchanged as the fallback until v2 proves
reliable, per the issue's own product principle.
**Migration effort:** additive; `ops.dc.html`, `ops/status.json`, `ops-status-refresh.yml`, and
every `scripts/ops-status-*.mjs` file are unmodified. `robots.txt` gained one more `Disallow`
line for the new page.
**Priority:** N/A — shipped as scoped by issue #42 Phase 1 + Phase 2 (high risk, per the
issue's own risk tier). Stops before merge; does not activate the new staged workflow
(`.github/workflows/` is outside this change's permitted scope — see
`docs/AUTOMATION_WORKFLOW.md` activation checklist, which gained a `deployments: read`
permission note for this workflow specifically). Phase 3 (Guide Factory/renderer/link-engine
live wiring) and Phase 4 (CEO summary polish, dedicated mobile QA pass) are explicitly not
part of this change — see `docs/OPS_DASHBOARD_V2.md` "What's deliberately deferred."

## Non-recommendations (things we're deliberately not changing)

- **Inline styles / no CSS framework:** works fine at current page count; not a scalability bottleneck worth solving speculatively.
- **No TypeScript today:** worth introducing once there's a real API contract to type (Recommendation 2), not before — typing three ad hoc JS arrays isn't valuable on its own.
