# WearWyzer — Knowledge Graph Migration Plan

Companion to `docs/KNOWLEDGE_GRAPH_V1.md`. That document describes the additive foundation as it exists after issue #12. This document describes the phased path from "additive and unused" to "canonical and driving the live site" — none of the phases after Phase 0 are implemented yet.

Same provenance caveat as the spec doc: derived from repository sources, not the canonical Notion doc (no access from this environment). Reconcile against Notion before treating the phase ordering below as final.

## Phase 0 — Additive foundation (this issue, #12)

**What ships:** `data/*.js` modules, computed from `js/products.js`/`js/guides.js`; `data/adapters.js` to reproduce the legacy contract from them; `scripts/validate-knowledge-graph.mjs`; this documentation set.

**What does not change:** every `.dc.html` page's data source, every page's rendered output, `js/products.js`, `js/guides.js`.

**Exit criteria:** `node scripts/validate-knowledge-graph.mjs` exits 0; `node scripts/compare-legacy-adapter.mjs` shows zero unintentional differences between the legacy files and the adapter's reconstruction of them; all existing validators/pages remain green (see "Validation requirements" in the issue).

**Risk:** Low. No production code path changes.

## Phase 1 — Editorial write path for the graph (not started)

**Scope:** decide how `data/*.js` records get authored going forward without becoming a second hand-edited flat-file system that drifts from `js/products.js`/`js/guides.js` the same way `ARCHITECTURE.md` Recommendation 2 already warns flat files do. Candidates, not yet decided:
- Generate `data/*.js` from `js/products.js`/`js/guides.js` at commit time via a script (keeps one authored source, `data/` becomes a build artifact) — lowest-risk, smallest change from Phase 0's current "computed at import time" approach.
- Author `data/*.js` directly and generate `js/products.js`/`js/guides.js` from it via `data/adapters.js` (inverts today's direction) — only makes sense once there's a reason to add graph-only fields (e.g. `confidence`/`verificationStatus` overrides an editor sets by hand) that have no legacy equivalent to derive from.

**Dependency:** Phase 0 merged and stable for at least one real content update cycle, so there's evidence the derived modules stay correct as `js/products.js`/`js/guides.js` change.

**Risk:** Low–Medium — still no backend, still git-based content, but changes the authoring ergonomics content editors rely on (`DEVELOPMENT.md`'s "Adding a new style guide" steps).

## Phase 2 — Multi-offer Product/Retailer model (not started)

**Scope:** this is `ARCHITECTURE.md` Recommendation 4 ("Affiliate Engine as a real system, not a field on a product object"), implemented on top of the Offer entity Phase 0 already introduced. `data/offers.js` moves from a 1:1 `id === productId` construction to N offers per product, each with its own retailer/price/status. Requires a real decision on click tracking (`/go/:offerId` redirect + logging) which needs a backend — this phase cannot complete as a static-site-only change.

**Dependency:** `ROADMAP.md` Milestone 3 (Core database + API) — Recommendation 4 is explicitly sequenced "once Recommendation 2 lands" for the same reason.

**Risk:** Medium once a backend exists; the issue's `ARCHITECTURE.md` source explicitly rates it High if attempted before one does. Do not attempt this phase before Milestone 3.

## Phase 3 — Guide/Product pages read from `data/` instead of `js/`

**Scope:** flip the `.dc.html` page controllers currently doing `import('./js/guides.js')` / `import('./js/products.js')` (see `guide-on-cloud-x4.dc.html`, `guide-nb9060.dc.html`, `guide-barrel-pants-nb530.dc.html`, `shop.dc.html`, `products.dc.html`, `guides.dc.html`) to instead read through `data/adapters.js` (or directly from `data/*.js`, once the page contract expectations are re-verified against the richer shape). This is the only phase that changes anything a site visitor can observe, so it needs the full verification bar `CLAUDE.md` sets: every page loaded in a real browser, zero new console warnings, zero visual regressions.

**Dependency:** Phase 0's adapter output must have been proven equivalent to the legacy files (via `scripts/compare-legacy-adapter.mjs`) across at least one real content change, not just at the moment of writing.

**Risk:** Medium — touches every live page's data source, but is reversible (revert the import, `js/*.js` is untouched) and does not change any visible content by construction if the adapter is truly equivalent.

## Phase 4 — Outfit Intelligence / recommendation surfaces

**Scope:** the actual `ARCHITECTURE.md` Recommendation 5 systems (Outfit Builder, AI Stylist) that need `isPubliclyRecommendable()` to gate what a recommendation engine is allowed to surface. This is the first phase where `confidence`/`verificationStatus` values other than the ones Phase 0 already produces (all `editorial`/`verified` except the one `unverified`/`draft` alternative) start to matter in practice — an inference-based recommendation would land as `inferred` confidence and require an explicit promotion step to reach `verified`.

**Dependency:** `ROADMAP.md` Milestones 7 and 8 (Closet/Wishlist, Outfit Intelligence) — explicitly sequenced last in that document, "there is nothing for an AI layer to reason over until the databases beneath it exist." Phase 0 is exactly that "databases beneath it" starting point, not a shortcut past this dependency.

**Risk:** Not assessed here — out of scope until the milestones above land. `ROADMAP.md` should be the source of sequencing truth at that point, not this document.

## Non-goals across every phase

- Never fabricate a brand, offer, price, affiliate URL, or relationship to fill a gap — an empty/`null` field plus a `missing_canonical_data` or `ambiguous_review_required` `reviewStatus` is always preferred, per `CLAUDE.md`'s hard rule.
- Never let `data/*.js` and `js/*.js` diverge silently — every phase above either derives one from the other or explicitly flips which is canonical; there is never a point where both are hand-edited independently.
