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

## Non-recommendations (things we're deliberately not changing)

- **Inline styles / no CSS framework:** works fine at current page count; not a scalability bottleneck worth solving speculatively.
- **No TypeScript today:** worth introducing once there's a real API contract to type (Recommendation 2), not before — typing three ad hoc JS arrays isn't valuable on its own.
