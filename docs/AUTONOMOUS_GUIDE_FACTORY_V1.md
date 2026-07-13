# WearWyzer — Autonomous Site and Guide Factory v1 (issue #17)

Companion to `docs/AUTONOMOUS_ENGINEERING_V1.md` (issue #16's queue foundation, which this
epic reuses rather than replaces) and `docs/KNOWLEDGE_GRAPH_V1.md` (the entity/relationship
model every generated guide must resolve against). This document is the canonical spec for
everything issue #17 scopes: the guide manifest contract, the guide factory pipeline, the
site-upgrade queue integration, deployment health/rollback, the notification-by-exception
contract, the renderer adapter boundary, and the content quality policy.

## Operating principle

The default state is autonomous execution. A human is interrupted only for the six
exception categories in "Notification-by-exception" below — everything else either
completes silently (logged to the dashboard) or stops itself at `needs-human` with a
specific, actionable reason. The pipeline never guesses at a missing fact, never invents a
price/affiliate/availability claim, and never fabricates an asset it couldn't actually
render.

## 1. Guide job manifest (`scripts/guide-manifest-schema.mjs`)

A manifest is the single, versioned, machine-readable source of truth one guide factory run
consumes. Required fields (see `REQUIRED_MANIFEST_FIELDS`): `jobId`, `schemaVersion`,
`status`, `riskTier`, `confidence`, `heroProductId`, `concept`, `hook`, `audience`,
`sources`, `outfits`, `slides`, `website`, `social`, `assets`, `publication`, `createdAt`.
Optional: `productReferences`, `newProducts`, `styleNotes`.

- **`riskTier`** is always `medium` or `high` — a new guide is a new customer-facing page,
  which `docs/AUTONOMOUS_ENGINEERING_V1.md`'s risk model already classifies as at least
  medium risk. A manifest declaring `risk-low` is rejected at the shape-validation stage.
- **`sources[]`** (`{ url, verifiedAt }`) must each carry a `verifiedAt` timestamp no older
  than `DEFAULT_MAX_SOURCE_AGE_DAYS` (120 days). Missing or stale → `needs-human`.
- **Product references** (the `heroProductId`, every `productReferences` entry, every
  outfit item's `productId`) must resolve to either a real `data/products.js` product or a
  manifest-declared `newProducts` entry. Never silently dropped, never invented.
- **`newProducts[]`** entries must obey `CLAUDE.md`'s content-integrity rule exactly:
  `price` stays `null` unless `priceStatus` is `"confirmed"` *and* a `priceSourceUrl` backs
  it up; `affiliateUrl` stays unset unless an `affiliateSourceUrl` backs it up.
  `findFabricationViolations()` rejects anything else as a fabricated fact.
- **Hero/concept duplication**: `checkHeroCooldown()` rejects a `heroProductId` that
  matches an existing guide's (derived) hero within `DEFAULT_HERO_COOLDOWN_DAYS` (60 days).
  `checkConceptDuplication()` rejects a token-overlap similarity ≥ 60% against any guide
  published within `DEFAULT_CONCEPT_COOLDOWN_DAYS` (60 days). Neither check can run against
  real `js/guides.js` records directly — see "Deriving a hero product for existing guides"
  below.

`validateGuideManifest()` aggregates every check above into one result: `valid` plus every
category of problem populated, so the caller can report *which* fact is missing/stale/
duplicated instead of a generic failure.

### Deriving a hero product for existing guides

`js/guides.js` has no explicit `heroProductId` field — the hero is only ever the product
common to every one of a guide's outfits (see `docs/HERO_PRODUCT_V1.md`, which had to
document this by hand for the one guide it covers). `scripts/guide-factory.mjs`'s
`deriveHeroProductId()` computes this generically (the intersection of every outfit's item
`productId`s), and `buildExistingGuideContext()` projects real guides into the shape the
schema's dedup checks expect. This is a read-only derivation — it never writes a
`heroProductId` field back into `js/guides.js`.

## 2. Guide factory pipeline (`scripts/guide-factory.mjs`)

Pure orchestration — the only I/O lives in `scripts/guide-factory-cli.mjs` (reads
`automation/guide-jobs/*.json`, reads the live `data/products.js`/`js/guides.js` snapshot,
writes nothing to site content itself — see "Why the CLI doesn't write site files yet").

1. `selectNextApprovedJob()` — single-flight, oldest `approved` job first. Refuses to select
   while any job is `in-progress` (same rule as `docs/AUTONOMOUS_ENGINEERING_V1.md`'s
   engineering queue).
2. `validateGuideManifest()` (§1). Any failure → `outcome: 'needs-human'`,
   `stage: 'manifest-validation'`.
3. `buildGuideRecord()` — the `js/guides.js`-shaped record the factory would write.
4. `buildNewProductRecords()` — any `newProducts` the manifest declared, copied verbatim
   (never re-derived or embellished).
5. `generateSlideSpecs()` — structured, ordered slide specs (label/copy/altText/dimensions).
6. `renderSlides()` via the renderer adapter (§7).
7. `runContentQualityPolicy()` (§5). Any blocking violation → `outcome: 'needs-human'`,
   `stage: 'content-quality-policy'` — but `slideSpecs`/`renderedAssets` are always returned
   intact, even on failure, so a blocked asset is never silently discarded.
8. `generateMetadata()` — caption, alt text, SEO title/description, sitemap entry, internal
   links.
9. `renderGuidePageHtml()` (`scripts/guide-page-template.mjs`) — the reusable `.dc.html`
   template every generated guide page is stamped from (see §"Reusable page template").
10. Success → `outcome: 'ready-for-pr'`, `haltsForReview: true` (a guide is never risk-low,
    so it never qualifies for the guarded low-risk auto-merge gate in
    `docs/AUTONOMOUS_ENGINEERING_V1.md` — a human always merges it).

### Reusable page template (`scripts/guide-page-template.mjs`)

`renderGuidePageHtml()` produces a page structurally identical to the hand-authored guide
pages (`guide-on-cloud-x4.dc.html`, `guide-nb9060.dc.html`): `<dc-import>` for Site
Nav/Footer, a `DCLogic` controller that reads `js/guides.js`/`js/products.js`/
`js/hero-pages.js` at runtime, and every cross-page link (hero product page, related
guides) computed from actual data — never hardcoded (`CLAUDE.md`'s rule about the
`shop.dc.html`/`products.dc.html` hardcoded-guide-link bug this repo is still tracking as
debt). One template, parameterized by `guideId`/`heroProductId`/title/description/cover —
adding a guide never requires hand-authoring a new page file's markup.

### Why the CLI doesn't write site files yet

`scripts/guide-factory-cli.mjs` runs the full pipeline and prints the `ready-for-pr` result
(guide record, product records, page HTML, metadata) as evidence, but does not itself
append to `js/guides.js`/`js/products.js`, write the `.dc.html` file, or open a PR. Doing
that safely requires branch creation, running the existing validators against the
*written* files (not just the in-memory result), and opening a PR — all real git/GitHub
operations this environment has no case to exercise against a real, verified manifest (see
"Why no fixture guide was published to the live site"). The pipeline's output is
structured specifically so that last step is mechanical once a maintainer authors the first
real, approved manifest: pipe `guideRecord`/`productRecords`/`pageHtml` into the same
append/write/validate/PR flow this repo's `docs/AUTOMATION_WORKFLOW.md` already describes
for engineering-queue issues.

### Why no fixture guide was published to the live site

Proving the pipeline "for real" would mean either inventing a product/guide (a direct
violation of `CLAUDE.md`'s content-integrity rule) or spending real, currently-unavailable
verified source facts. Instead, `scripts/simulate-guide-factory.mjs` runs the complete
pipeline — manifest validation, product/guide record construction, deterministic
rendering, content quality policy, page template, metadata/sitemap generation — against an
isolated fixture universe (`scripts/__fixtures__/guide-jobs.mjs`) that never touches
`js/products.js` or `js/guides.js`. Run it with:

```
node scripts/simulate-guide-factory.mjs
```

Exit code `0` and `outcome: "ready-for-pr"` is the evidence for this epic's acceptance
criterion "one approved fixture guide can run end-to-end from manifest to validated PR with
no human prompt relay."

## 3. Site upgrade queue integration

Site-upgrade jobs run through the **same** queue issue #16 already built
(`scripts/queue-rules.mjs`/`scripts/queue-dispatch.mjs`/`scripts/queue-pr-state.mjs`) — there
is no separate site-upgrade dispatcher. Any issue labeled with the existing
`ready`/`risk-*`/`priority-*` contract is eligible regardless of whether its content is a
guide-adjacent site change or a general engineering task; `scripts/__tests__/site-upgrade-
queue.test.mjs` proves this concretely (a `risk-low` site-upgrade issue reaches the same
guarded auto-merge gate as any other risk-low issue, `risk-medium`/`risk-high` stop the same
way). What issue #17 adds on top:

- **`site-incident` suspension** (§4): `canDispatch()` in `scripts/queue-rules.mjs` now also
  checks `openIncidentIssues` and refuses to dispatch *anything* — engineering issue, site
  upgrade, or guide job — while one is open, taking priority over every other gate.
  `scripts/queue-dispatch.mjs`'s `loadState()` fetches open `site-incident` issues alongside
  its existing in-progress/PR checks.
- The guarded low-risk auto-merge gate (`evaluateAutoMergeEligibility()`) is unchanged and
  still reporting-only by default — this epic's "do not enable unrestricted auto-merge"
  exclusion applies identically to site-upgrade and guide-factory PRs.

## 4. Deployment health check and rollback

`scripts/deploy-health-check.mjs` (pure route checks) + `scripts/rollback.mjs` (pure
rollback decision) + `scripts/deploy-health-check-cli.mjs` (the I/O glue: fetch, ledger,
GitHub issue).

- **Health check**: fetches every route in `DEFAULT_CRITICAL_ROUTES` (`/`, `/guides.html`,
  `/shop.html`, `/products.html`, `/about.html`) and checks HTTP status, presence of a
  `<title>`, and — since a real browser/Playwright run isn't available in this dependency-
  free CI — greps the served HTML for a literal, unrendered `{{ field }}` binding as a
  deterministic proxy for the dc-runtime's own console warning (`CLAUDE.md`'s "Verifying a
  change" — the runtime never strips a binding it couldn't resolve, so the text survives
  into the response body).
- **Rollback plan** (`planRollback()`): `action: 'none'` if healthy. `action: 'open-revert-
  pr'` (`safe: true`) only when a distinct last-known-healthy commit is recorded
  (`automation/status/last-healthy-deploy.json`, written by every successful health check) —
  never guesses a revert target without one. Otherwise `action: 'incident-only'`
  (`safe: false`).
- **A revert is always a reviewable PR, never an unreviewed push to `main`** — this epic's
  "do not enable unrestricted auto-merge" exclusion applies to rollback the same as to
  guide/site-upgrade PRs. `buildRevertCommands()` produces the exact `git revert`/`gh pr
  create` commands (no `--force`, no auto-merge) for a human or a follow-up automated step
  to execute.
- On failure: opens a `site-incident` + `needs-human` issue via the existing queue GitHub
  client (`scripts/queue-github-client.mjs`) with `buildIncidentReport()`'s concise report,
  which suspends the whole queue per §3.

## 5. Content quality policy (`scripts/content-quality-policy.mjs`)

Blocking checks (any failure → `needs-human`):
- `checkAudienceConsistency` — `audience.gender` must be `men`/`women`/`unisex`.
- `checkEditorialStructure` — at least `MIN_OUTFITS` (3) outfits, each with
  `name`/`when`/`why`/non-empty `items`.
- `checkOutfitDiversity` — no two outfits with an identical item set or a repeated `when`
  context.
- `checkCarouselDimensions` — `MIN_SLIDES`–`MAX_SLIDES` (4–10) slides, mobile-safe aspect
  ratio (1:1 or 4:5, matching every published guide's slide images).
- `checkAssetNamingAndExistence` — every slide's asset path matches the
  `slide-NN.<ext>` convention every existing guide already uses, and actually rendered
  (`status: 'rendered'`, not `'blocked'`).

Reporting-only, never blocking: `reportAffiliateCoverage()` — the fraction of a guide's
shoppable products with a real affiliate link vs. "Link coming soon", matching this epic's
"affiliate coverage reporting without compromising styling quality" requirement.

`isEligibleForPublicRecommendation()` reimplements (rather than imports) the same rule as
`data/taxonomies.js`'s `isPubliclyRecommendable()` — `verificationStatus === 'verified'` and
`confidence` at least `editorial` — so this module stays standalone and testable against a
guide record before anything is ever written to `data/`.

## 6. Notification-by-exception (`scripts/notify-exception.mjs`, `scripts/status-log.mjs`)

Six categories notify a human (`EXCEPTION_TYPES`): `deploy-health-failure`,
`automation-blocked-after-retries`, `ambiguous-editorial-decision`,
`protected-path-or-high-risk`, `missing-or-expired-credential`, `unverifiable-product-facts`.
Everything else — `routine-success` — is appended to `automation/status/events.jsonl`
(`scripts/record-status-event.mjs`) and never sent as an interruptive alert.
**Fail-safe classification**: an event type this module doesn't recognize is treated as
notify-worthy, not silently dropped — see `classifyEvent()`'s `fallback` field.

```
node scripts/record-status-event.mjs digest
```
prints a daily-digest-style markdown summary (`summarizeDaily()`/`renderDailyDigestMarkdown()`)
— total/routine/exception counts by type, plus every exception verbatim.

## 7. Renderer adapter boundary (`scripts/guide-renderer-adapter.mjs`)

Two modes (`RENDERER_MODES`):
- **`deterministic-template`** (default, always available): renders each slide spec into a
  self-contained SVG using this repo's existing palette/type — no network, no credential.
  Byte-for-byte deterministic for the same input (unit-tested).
- **`external-provider`** (optional, inert in this repository): the interface exists
  (`renderSlideExternalProvider()`) for a future image-generation service, but this epic's
  "do not add paid API credentials" exclusion means `providerConfig` has nowhere to come
  from here — it always reports `status: 'blocked'` with a reason, never throws, never
  fabricates an asset. No dependency on any specific conversation's image generator.

If a manifest's `assets.rendererMode` requests `external-provider` and no credentials are
configured, the pipeline still produces complete slide *specifications* (§2 step 5) but the
content quality policy correctly fails the job to `needs-human` on the unrendered assets
(§5) — visual rendering is marked blocked, never pretended.

## 8. Tests and simulation

`node --test scripts/__tests__/*.test.mjs` (dependency-free, deterministic, no network) —
covers every scenario this epic's §8 lists:

| Scenario | Test file |
|---|---|
| Complete guide job success | `guide-factory.test.mjs` ("ready-for-pr") |
| Missing product fact | `guide-factory.test.mjs`, `guide-manifest-schema.test.mjs` |
| Duplicate hero/concept rejection | same |
| Stale source rejection | same |
| Missing asset | `guide-factory.test.mjs` (external-provider unconfigured) |
| Failed validator | `guide-factory.test.mjs` (too-few-outfits), `content-quality-policy.test.mjs` |
| Failed deployment health check | `deploy-health-check.test.mjs` |
| Rollback/suspension behavior | `rollback.test.mjs`, `queue-rules.test.mjs` (site-incident tests) |
| Routine low-risk upgrade | `site-upgrade-queue.test.mjs` |
| Medium/high-risk review halt | `site-upgrade-queue.test.mjs` |
| Exception notification creation | `notify-exception.test.mjs` |

Plus `node scripts/simulate-guide-factory.mjs` for the literal end-to-end fixture run (§2).

## 9. Activation checklist

Same constraint as issue #16: Claude's GitHub App token cannot write to
`.github/workflows/`. Three new workflow files are staged in
`docs/automation/workflows/` for a maintainer to copy in:

1. `guide-factory-dispatch.yml` — runs `scripts/guide-factory-cli.mjs` on a schedule/manual
   dispatch.
2. `deploy-health-check.yml` — runs `scripts/deploy-health-check-cli.mjs` after every
   successful Pages deploy (`workflow_run` on `Deploy to GitHub Pages`).
3. The existing `dispatch-queue.yml`/`pr-state-sync.yml` (issue #16) need no changes —
   `site-incident` suspension is pure logic already inside `scripts/queue-rules.mjs`.

Until copied in, run every CLI manually or via `workflow_dispatch` once staged.

## What this version deliberately does not do

- Does not write to `js/guides.js`/`js/products.js`/any `.dc.html` page, and does not open a
  real PR for a guide — see "Why the CLI doesn't write site files yet".
- Does not add any paid API credential, provider config, or secret — the external-provider
  renderer path is wired but permanently inert without one.
- Does not publish to Instagram or any external platform.
- Does not enable unrestricted auto-merge, for guide PRs, site-upgrade PRs, or rollback PRs
  — every one of them stops for explicit human review.
- Does not implement an actual headless-browser console-warning check — the deploy health
  check's unresolved-binding detection is a dependency-free HTML-grep proxy for the same
  signal (see §4), not a Playwright run.
