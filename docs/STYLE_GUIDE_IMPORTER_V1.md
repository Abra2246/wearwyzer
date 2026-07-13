# WearWyzer — Style Guides Folder Importer v1 (issue #34)

Companion to `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` (issue #17, whose guide-manifest
contract and pipeline this importer feeds) and `docs/KNOWLEDGE_GRAPH_MIGRATION.md` (which
explains why this importer does not write directly to `data/*.js`). This document is the
canonical spec for `scripts/style-guide-importer.mjs` / `scripts/style-guide-importer-cli.mjs`.

## 1. The inventory finding this importer was built against

Issue #34 asked to "first inventory the actual contents of the `Style Guides` folder and
report the exact count and formats found." That inventory was run before any conversion
code was written:

- **A directory named `Style Guides` (or any case/spacing variant of it) does not exist
  anywhere in this repository** — not in the current working tree, not in `git log --all`
  across every commit, and not on any of the repository's 19 branches (verified via
  `git branch -a` and per-branch history search).
- **Exact count of source files found: 0. Formats found: none.**

Per `CLAUDE.md`'s content-integrity rule ("never fabricate... isolate unresolved facts as
`needs-human` without guessing"), this importer does not invent guide content to
demonstrate itself against. Instead it ships as real, working, tested infrastructure —
proven end-to-end against an isolated fixture universe
(`scripts/__fixtures__/style-guide-sources.mjs`, run via
`node scripts/simulate-style-guide-import.mjs`), exactly as issue #17's guide factory
itself shipped with no real manifest to run against (see that doc's "Why no fixture guide
was published to the live site"). `scripts/__tests__/style-guide-importer.test.mjs`
includes a regression test asserting the real `Style Guides` directory is still absent, so
this finding stays verified rather than going stale in prose.

If a real `Style Guides` folder is added later, running
`node scripts/style-guide-importer-cli.mjs` immediately does real, useful work against it —
no further code changes required for the common cases this spec covers (see §2-3).

## 2. Supported source formats (`scripts/style-guide-importer.mjs`)

- **Structured (`.json`)** — a JSON document using (a subset of) the issue #17 guide-manifest
  field names (`heroProductId`, `concept`, `hook`, `audience`, `sources`, `outfits`,
  `slides`, `website`, `social`, `newProducts`, etc). `buildDraftManifestFromStructuredSource()`
  fills only honest, non-factual scaffolding (`jobId`, `schemaVersion`, `status: "draft"`,
  `riskTier: "medium"`, `confidence: "unverified"`) — every actual fact (concept, hook,
  outfits, product references, sources) is copied verbatim or left `null`/missing if the
  source didn't provide it, never synthesized.
- **Freeform text (`.md`, `.markdown`, `.txt`)** — always isolated as `needs-human`.
  Auto-extracting outfits/products/sources from prose would require guessing at structure,
  which this repo's content-integrity rule forbids; a human must transcribe the real facts
  into the structured JSON contract above.
- **Known unsupported binary formats (`.docx`, `.doc`, `.pdf`, `.pages`, `.rtf`)** — flagged
  as `needs-human`, never silently dropped. This is a dependency-free repo with no
  document-conversion library, so these formats cannot be parsed safely.
- **Any other/unknown extension** — flagged as `needs-human` (fail-safe classification,
  same principle as `scripts/notify-exception.mjs`'s `classifyEvent()` fallback: an
  unrecognized case is treated as notify-worthy, not silently ignored).

## 3. Pipeline (`runStyleGuideImportJob`)

For each source file: classify by extension (§2) → for structured sources, parse JSON and
build a draft manifest → **exact-duplicate check** against canonical `js/guides.js`
(`findExactCanonicalDuplicate()`: slug or case-insensitive title match — a hard, unambiguous
check, run *before* full validation, so an already-published guide is never reprocessed) →
**full manifest validation**, reusing `scripts/guide-manifest-schema.mjs`'s
`validateGuideManifest()` verbatim — the same shape/staleness/unresolved-product-
reference/fabrication/hero-cooldown/concept-duplication gate a hand-authored manifest must
pass. Every source resolves to exactly one disposition:

| Disposition | Meaning |
|---|---|
| `draft-manifest-ready` | Source converted cleanly; a `status: "draft"` manifest was produced. |
| `duplicate-skipped` | Source already exists in canonical `js/guides.js` (by slug or title). |
| `needs-human` | Format unsupported/unrecognized, invalid JSON, freeform text, or the manifest is missing/stale/duplicate/fabricated per `validateGuideManifest()`. `reasons[]` always says exactly why. |

The pipeline never writes anything itself — it is pure, dependency-free, unit-tested data
in/data out (`scripts/__tests__/style-guide-importer.test.mjs`), matching the existing
split between `scripts/guide-manifest-schema.mjs`/`scripts/guide-factory.mjs` (pure) and
their `-cli.mjs` counterparts (I/O).

## 4. Why manifests land as `draft`, never `approved`

A locally-imported document has no way to carry a genuinely fresh, human-verified
`sources[].verifiedAt` timestamp — the importer cannot itself visit a URL and confirm a
fact is still true. So every converted manifest is written with `status: "draft"` and
`confidence: "unverified"`, exactly matching `automation/guide-jobs/README.md`'s existing
lifecycle (`draft → approved → in-progress → ready-for-pr / needs-human → published`): **a
human editor must verify every source and product fact and move the file to `approved`
before `scripts/guide-factory-cli.mjs` will ever select it.** This is not a limitation to
fix later — it is the same fact-integrity boundary this repo enforces everywhere else, and
it is exactly why "generate/update guide pages through the Guide Factory" in this change
means *proving the two pipelines compose* (§5), not auto-publishing anything.

## 5. Composing with the Guide Factory (`scripts/simulate-style-guide-import.mjs`)

Because a draft manifest this importer builds has the identical shape a
hand-authored one does, it flows through `scripts/guide-factory.mjs`'s
`runGuideFactoryJob()` unmodified once promoted to `approved`.
`scripts/simulate-style-guide-import.mjs` proves this end-to-end against the fixture
universe: import → `draft-manifest-ready` → (simulated human promotion to `approved`) →
guide factory → `ready-for-pr`. Run it with:

```
node scripts/simulate-style-guide-import.mjs
```

Exit code `0` is the evidence that the importer's output and the existing guide factory
compose correctly with no fabricated content and no human prompt relay.

## 6. Why this does not write to `data/*.js` (the Knowledge Graph)

`docs/KNOWLEDGE_GRAPH_MIGRATION.md` Phase 0 (already shipped, issue #12) computes every
`data/*.js` record from `js/products.js`/`js/guides.js` at import time — there is no manual
`data/*.js` write path yet, and Phase 1 ("editorial write path for the graph") is explicitly
**not started**, gated on Phase 0 "merged and stable for at least one real content update
cycle." Building a new, importer-specific write path into `data/*.js` here would jump that
sequencing (`CLAUDE.md`'s "Scope discipline": check `ROADMAP.md`/`ARCHITECTURE.md` before
proposing a different approach than what's already recommended). Instead: once a promoted,
approved manifest is actually run through the guide factory and its `guideRecord`/
`productRecords` are appended to `js/guides.js`/`js/products.js` (the existing, deliberately
manual last mile — see `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` "Why the CLI doesn't write site
files yet"), the corresponding `data/*.js` Knowledge Graph records follow automatically,
for free, the next time anything imports `data/*.js` — no separate importer-owned write path
required.

## 7. Preserving existing assets

This importer and its CLI never read from or write to `assets/images/guides/` or
`uploads/`. It has no code path that touches an image file at all — a converted manifest's
`assets.rendererMode` defaults to `"deterministic-template"` (the existing guide factory's
SVG renderer), and even that renderer only ever runs once a human promotes a manifest to
`approved` and a maintainer runs `scripts/guide-factory-cli.mjs`, which is unchanged by this
issue. No existing carousel slide, cover image, or product image is read, regenerated, or
deleted by anything shipped here.

## 8. Provenance and disposition report

`scripts/style-guide-importer-cli.mjs` writes
`automation/status/style-guide-import-report.json` — `scannedAt`, whether the source
directory existed, the total source count, a count of sources by format, a count of sources
by disposition, and the full per-source result list (`sourcePath`, `format`, `disposition`,
`reasons[]`, and the draft manifest's `jobId` where applicable). This is the "truthful
provenance and per-guide disposition report" issue #34 asked for; running it live against
this repository today produces (confirmed by actually running it):

```
Style Guides source directory exists: false
Sources found: 0
Formats: {}
Dispositions: {}
```

## 9. Tests

`node --test scripts/__tests__/style-guide-importer.test.mjs` — dependency-free,
deterministic, no network; covers every disposition in §3 plus the disposition-report
aggregation and an explicit regression assertion that the real `Style Guides` directory is
still absent (§1). Plus `node scripts/simulate-style-guide-import.mjs` for the literal
end-to-end fixture run (§5).

## 10. What this version deliberately does not do

- Does not fabricate, guess, or transcribe any guide content from a source that doesn't
  exist — see §1.
- Does not write to `js/guides.js`, `js/products.js`, `data/*.js`, or any `.dc.html` page.
- Does not call the guide factory's renderer against real content, regenerate any existing
  image, or touch `assets/images/guides/`/`uploads/` at all — see §7.
- Does not add a new `data/*.js` write path ahead of `docs/KNOWLEDGE_GRAPH_MIGRATION.md`
  Phase 1 — see §6.
- Does not publish, merge, or open a PR itself.
