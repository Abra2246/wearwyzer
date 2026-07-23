# WearWyzer — Guide Production Writer v1 (issue #46)

Companion to `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` (the pipeline this writer's input comes
from) and `docs/LINK_ENGINE_V1.md` (the affiliate coverage report this writer regenerates).
This document is the canonical spec for issue #46's scope: the production writer that turns
an approved Guide Factory manifest into the actual site-ready content the static architecture
serves, wired into the same dispatch flow, idempotent, with no fabricated data.

## Operating principle

`scripts/guide-factory.mjs` already validates a manifest and produces a complete,
`ready-for-pr` guide record — but by the deliberate scope boundary issue #17 documented
("Why the CLI doesn't write site files yet"), nothing ever turned that result into an actual
file on disk. This issue closes that gap: `scripts/guide-production-writer.mjs` (pure) plus
`scripts/guide-production-writer-cli.mjs` (the only file in this feature that touches disk)
take a `ready-for-pr` result and idempotently write every rendered slide asset, a verified cover,
`js/guides.js`, `js/products.js`, the new `*.dc.html` page, and `sitemap.xml` — reusing the existing guide template and canonical
Knowledge Graph exactly as they are, never inventing a parallel content model.

## 1. What gets written (`scripts/guide-production-writer.mjs`)

Pure text/data transforms only — no filesystem or network access in this module.

- **`js/guides.js`** — the manifest's `guideRecord` is serialized (`serializeRecord()`, a
  small deterministic object-literal pretty-printer matching this repo's existing 2-space,
  unquoted-key, double-quoted-string style) and inserted immediately before the exported
  array's closing `];` (`insertBeforeArrayClose()`). Detected as already-published
  (`recordExists()`, an `id: "..."` substring check) → skipped, not duplicated.
- **`js/products.js`** — any manifest-declared `newProducts` are appended the same way.
  Every *existing* catalog product this guide references (the hero, or any supporting item)
  gets this guide's id appended to its own `featuredInGuides` array
  (`addGuideToFeaturedInGuides()`) — this is how the hero-product-to-guide relationship (and
  every supporting-item relationship) actually gets updated, the same pattern every
  multi-guide product in `js/products.js` already demonstrates by hand (e.g. `oxford-shirt`
  lists more than one guide id). Idempotent: a guide id already present in the list is a
  no-op.
- **`sitemap.xml`** — one `<url>` entry (from the factory result's `metadata.sitemapEntry`)
  upserted before `</urlset>`, keyed on `<loc>` so a repeat run never duplicates it
  (`upsertSitemapUrl()`).
- **The new `*.dc.html` page** — written verbatim from the factory result's `pageHtml`
  (`scripts/guide-page-template.mjs`'s reusable template — no new page markup is ever
  hand-authored) only if the file doesn't already exist.
- **Rendered guide assets** — `scripts/guide-production-assets.mjs` verifies a complete rendered
  SVG exists for every canonical `guideRecord.slideImages[].src`, then writes those exact paths
  below `assets/images/guides/<guide-id>/`. The canonical `coverImage` is a byte-for-byte copy of
  verified slide 1, so it always exists without inventing a separate render. All targets are
  preflighted before any write. A missing/blocked asset or a conflicting existing file fails
  closed; identical existing files are skipped.
- **Guide discoverability** — `guides.dc.html` (the guide library) and the hero product's own
  page/nav links all read `js/guides.js`/`js/hero-pages.js` at runtime and require no
  additional edit: once the new guide record exists, it is automatically discoverable from
  the library and linked from its hero product's page (if the hero has one registered in
  `js/hero-pages.js`) via the same `FEATURED_IN` derivation `docs/KNOWLEDGE_GRAPH_V1.md`
  already documents.

`planGuideProduction()` composes every step above into one pure function returning the next
source text for every file plus a `changes` log (`{ type, id, applied, reason }` per change) —
`anyApplied`/`alreadyFullyApplied` let the caller (and a test) prove a repeat run is a true
no-op instead of merely asserting "no error was thrown."

## 2. The dispatcher (`scripts/guide-production-writer-cli.mjs`)

The only file in this feature that touches disk. Reuses `scripts/guide-factory.mjs`'s
`runGuideFactoryJob()`/`selectNextApprovedJob()` exactly as `scripts/guide-factory-cli.mjs`
does, then adds the write step:

1. **No approved job** → runs a real hero-candidacy assessment against the live Knowledge
   Graph (§3) instead of a bare "nothing to do." This is the wiring for issue #46's "if no
   existing hero has enough verified facts, stop with one precise needs-human report instead
   of inventing data."
2. **An approved job fails validation** → `needs-human`, identical reasons/notification path
   as `scripts/guide-factory-cli.mjs` (manifest-validation or content-quality-policy stage);
   the job file's `status` is rewritten to `needs-human`; an exception status event is logged.
3. **An approved job reaches `ready-for-pr`** → `planGuideProduction()` and
   `planGuideAssetWrites()` run. The complete asset set is preflighted and persisted first; only
   then are changed content files and the new page written, followed by
   `scripts/link-engine-cli.mjs`'s `runOnce()` is re-invoked so
   `automation/status/link-engine-report.json` (and therefore Mission Control's `linkEngine`
   card) reflects the new guide's outfits — `data/outfits.js` re-derives from `js/guides.js`
   on every fresh import, so this requires no separate patch to `data/`.

Every stage records a Mission Control status event (`scripts/record-status-event.mjs`):
`guide-production-started` when a job is claimed, an exception event when it blocks/needs a
human, and `guide-production-ready-for-review` + `guide-production-completed` once the write
succeeds. The CLI owns filesystem writes; the active workflow owns the dedicated branch and
review-PR handoff.

The CLI never opens or merges a PR. The active
`.github/workflows/guide-factory-dispatch.yml` validates the generated site, commits only the
Guide Factory output on a dedicated branch, and opens a reviewable PR. Generated content is
never merged automatically.

## 3. Hero-candidacy assessment (`scripts/hero-candidate-assessor.mjs`)

A product is hero-eligible for a *new* pilot guide only if all three hold:

1. It carries a styling `profile` block — the signal this repo already uses everywhere to
   mean "complete enough to anchor a guide" (`docs/HERO_PRODUCT_V1.md`'s selection table).
2. It clears `scripts/guide-manifest-schema.mjs`'s hero-cooldown check
   (`DEFAULT_HERO_COOLDOWN_DAYS` = 60) against every currently published guide.
3. The repository captures a real, verifiable `sourceUrl` on the product record — required
   because a manifest's `sources[]` field (`docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` §1) can
   never be honestly populated without one, and `CLAUDE.md` forbids inventing a citation to
   get past that check.

`assessHeroCandidates()` never guesses or invents a `sourceUrl` — a product without one is
reported ineligible with that exact reason. `renderHeroCandidateReport()` produces the
concise, actionable report used in both the console output and the notification/status event.

### Why no real guide was published in this change

Running `node scripts/guide-production-writer-cli.mjs` against this repository's actual
`js/products.js`/`js/guides.js` today reports **zero eligible hero candidates**:

- `on-cloud-x4` and `nb-530-turtledove` are blocked by hero cooldown — each already anchors a
  guide published within the last 60 days (`on-cloud-x4`, `barrel-pants-nb530`).
- `nb-9060-breakfast-tea` clears hero cooldown (its own guide is a co-branded, dual-hero
  guide with no single derived hero — see `scripts/guide-factory.mjs`'s
  `deriveHeroProductId()`) but is blocked on the third condition: this repository has never
  captured a real, verifiable source URL for any product's confirmed facts anywhere —
  `automation/guide-jobs/README.md` documents this same constraint for why that directory
  ships with zero real approved manifests. Inventing one here to force a pilot through would
  be exactly the fabrication `CLAUDE.md` and this issue's own exclusions forbid.

This is the issue's own explicitly-authorized outcome ("if no existing hero has enough
verified facts, stop with one precise needs-human report instead of inventing data"), not a
bug in the assessment. The full pipeline — from manifest to written `js/guides.js`/
`js/products.js`/page/sitemap entries to an idempotent repeat run — is proven end to end
against the existing isolated fixture universe instead:

```
node scripts/simulate-guide-production.mjs
```

Once a human editor adds a real `sourceUrl` to a candidate product (or one of the two
cooldown-blocked heroes ages out of its window) and authors + approves a manifest under
`automation/guide-jobs/`, `node scripts/guide-production-writer-cli.mjs` publishes it with no
further code change — the mechanical, file-by-file-edit-free path this issue scopes.

## 4. Mission Control integration

No schema change to `scripts/ops-status-schema.mjs` was needed: `guideFactory.state` already
derives from `automation/guide-jobs/*.json` status (`idle`/`in-progress`/`needs-human`, see
`scripts/ops-status-builder.mjs`'s `buildGuideFactory()`), and `linkEngine` already derives
from `automation/status/link-engine-report.json`. This writer keeps both inputs current: it
rewrites a job's `status` field on every outcome, and re-runs the link engine after every
successful write. Event types added to `automation/status/events.jsonl`:
`guide-production-started`, `guide-production-ready-for-review`,
`guide-production-completed`, plus the existing `unverifiable-product-facts` exception type
for both a blocked manifest and a "no eligible hero" assessment.

## 5. Tests and simulation

`node --test scripts/__tests__/guide-production-assets.test.mjs
scripts/__tests__/guide-production-writer.test.mjs
scripts/__tests__/hero-candidate-assessor.test.mjs` covers:

| Scenario | Test |
|---|---|
| Successful production (insert guide, patch existing products, upsert sitemap) | `guide-production-writer.test.mjs` |
| Missing product fact / fabricated price never reaches the writer | same |
| Missing rendered asset never reaches the writer | same |
| Idempotent re-run (no duplication) | same |
| Affiliate coverage report stays intact through the writer (reporting-only, never blocking) | same |
| Exact slide and cover paths, complete isolated writes, and byte-identical repeat | `guide-production-assets.test.mjs` |
| Blocked/missing/conflicting assets fail before partial output | same |
| Generated fixture page passes static asset QA | same |
| No hero-eligible candidate (cooldown, missing source) | `hero-candidate-assessor.test.mjs` |
| At least one eligible candidate | same |

Plus `node scripts/simulate-guide-production.mjs` for the literal end-to-end fixture run
(manifest → written assets and content records → static QA → proven byte-identical repeat
run), and `node scripts/guide-production-writer-cli.mjs --dry-run` against the real
Knowledge Graph as the evidence for §3's "why no real guide shipped" finding.

## 6. Active production handoff

`.github/workflows/guide-factory-dispatch.yml` calls the production writer directly. When a
publishable guide diff exists, it runs the content, static-site, Knowledge Graph, and hero-page
validators, creates a dedicated `automation/guide-production-*` branch, pushes the generated
files—including `assets/images/guides/**`—and opens a review PR labeled `automation-managed` and `risk-medium`. A no-op or blocked
candidacy run creates no branch. `docs/automation/workflows/guide-factory-dispatch.yml` is the
synchronized reference copy.

## What this version deliberately does not do

- Does not merge anything. The workflow opens a review PR and stops.
- Does not add a live affiliate credential, tracked-link substitution, or secret.
- Does not fabricate a `sourceUrl`, price, availability, or product match to force a pilot
  guide through — see §3.
- Does not change the guide-factory validation pipeline, the reusable page template, or the
  Knowledge Graph's derivation rules; it only adds the write step those already fully
  specify.
