# WearWyzer — Technical Roadmap

Status key: **Exists** · **Partial** · **Missing** · **Needs redesign**

## Feature gap analysis

| Feature | Status | Notes |
|---|---|---|
| Content site (home, guides, shop, about, contact, legal) | Exists | Static, hand-edited data files |
| Style guide pages | Partial | Works, but hand-duplicated per guide (see Architecture Rec. 1) |
| Product pages | Partial | `products.dc.html` shows profiles inline; no dedicated per-product URL/page yet |
| Product Search | Partial | Client-side substring filter only; not a real search system |
| Brand Pages | Missing | No brand entity exists at all — `brand` is a plain string field |
| Product Intelligence Database | Missing | No database of any kind |
| Outfit Intelligence Database | Missing | Outfits are hardcoded arrays inside guide objects |
| Brand Intelligence | Missing | — |
| Merchant Intelligence | Missing | — |
| Affiliate Engine | Missing | Today: one `affiliateUrl` string field per product (see Architecture Rec. 4) |
| AI Stylist | Missing | — |
| Outfit Builder | Missing | — |
| Closet | Missing | No user accounts of any kind |
| Wishlist | Missing | No user accounts of any kind |
| Admin / Editorial CMS | Missing | Content edited directly in `js/*.js` |
| Analytics Dashboard | Missing | No analytics instrumentation at all yet |

## Milestones

### Milestone 1 — Engineering Cleanup *(this audit)*
**Scope:** remove dead/duplicate files, document the real system, decide what NOT to build yet.
**Dependencies:** none.
**Deliverables:** this document set (`ENGINEERING_AUDIT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT.md`, `CONTRIBUTING.md`, `CHANGELOG.md`), dead code removed.
**Acceptance criteria:** no orphaned files referencing deleted systems; every doc reflects the actual codebase, not an aspirational one.
**Status: Done.**

### Milestone 2 — Guide template + routing
**Scope:** replace per-guide duplicated `.dc.html` files with one data-driven template (Architecture Rec. 1).
**Dependencies:** Milestone 1.
**Deliverables:** single guide template; existing 3 guides render from it; adding guide #4 requires zero new template files.
**Acceptance criteria:** editing the guide layout once updates all published guides.

### Milestone 3 — Core database + API
**Scope:** stand up a real database and API for guides, products, and retailer offers — the prerequisite for everything after this point (Architecture Rec. 2).
**Dependencies:** Milestone 2 (so the schema matches the settled guide shape, not the old one).
**Deliverables:** database schema, authenticated write API, `js/*.js` either generated from it or replaced by fetch calls.
**Acceptance criteria:** a non-engineer can add/edit a product or guide without touching code.

### Milestone 4 — Product & Brand pages, real Search
**Scope:** dedicated product detail pages, first-class brand pages, server-side search (Architecture Rec. 3).
**Dependencies:** Milestone 3.
**Deliverables:** `/products/:slug`, `/brands/:slug`, a real search endpoint backing the existing search UI.
**Acceptance criteria:** search scales independent of how much is shipped to the browser on page load.
**Note (issue #14):** one static, backend-free hero product page (`product-nb-9060-breakfast-tea.dc.html`) shipped ahead of this milestone as an explicitly scoped Knowledge Graph v1 vertical slice — see `ARCHITECTURE.md` "Decision — Hero Product page" and `docs/HERO_PRODUCT_V1.md`. It does not satisfy this milestone's real-search/brand-page/routing deliverables and should not be treated as evidence Milestone 4 can be skipped or is partially done outside its stated dependency on Milestone 3.

### Milestone 5 — Affiliate Engine
**Scope:** multi-retailer offers, click tracking/redirect endpoint, revenue attribution (Architecture Rec. 4).
**Dependencies:** Milestone 3.
**Deliverables:** `retailers`/`offers` schema, `/go/:offerId` redirect + logging, admin view of click/attribution data.
**Acceptance criteria:** every affiliate click is attributable to a specific guide and product.
**Note (issue #24):** a deterministic, fixture-driven verified-link matching/scoring/coverage
engine (`scripts/link-engine*.mjs`) shipped ahead of this milestone as an explicitly scoped
Knowledge Graph v1 exception — see `ARCHITECTURE.md` "Decision — Verified supporting-item
link engine v1" and `docs/LINK_ENGINE_V1.md`. It does not satisfy this milestone's
real-backend/click-tracking/revenue-attribution deliverables (no database, no redirect
endpoint, no live retailer/affiliate credential) and should not be treated as evidence
Milestone 5 can be skipped or is partially done outside its stated dependency on Milestone 3.

### Milestone 6 — Editorial CMS
**Scope:** an actual admin UI for content ops (guides, products, offers), replacing direct file edits.
**Dependencies:** Milestone 3.
**Deliverables:** authenticated admin app; draft/publish workflow.
**Acceptance criteria:** content team can ship a new guide without engineering involvement.

### Milestone 7 — Accounts, Closet & Wishlist
**Scope:** user accounts; save/organize owned items and want-to-buy items.
**Dependencies:** Milestone 3.
**Deliverables:** auth, `closet_items`/`wishlist_items` tables, account UI.
**Acceptance criteria:** a signed-in user can save a product from a guide to their closet or wishlist and see it persist.

### Milestone 8 — Outfit Intelligence & Outfit Builder
**Scope:** structured, queryable outfit data (not hardcoded arrays); a UI to compose outfits from the catalog.
**Dependencies:** Milestones 3, 4.
**Deliverables:** outfit schema linking products with roles/compatibility rules; builder UI.
**Acceptance criteria:** an outfit can be generated from catalog data without being hand-authored first.

### Milestone 9 — AI Stylist
**Scope:** recommend outfits/products from Closet/Wishlist contents and Outfit Intelligence data.
**Dependencies:** Milestones 7, 8. Deliberately last — there is nothing for an AI layer to reason over until the databases beneath it exist.
**Deliverables:** recommendation service; surfaced in-product (not a public "AI" pitch — matches the existing brand tone of quiet usefulness over hype).
**Acceptance criteria:** recommendations are generated from real structured data, not hardcoded guide content.

### Milestone 10 — Analytics Dashboard
**Scope:** internal dashboard over the data now being generated by Milestones 5–9 (clicks, saves, search queries).
**Dependencies:** Milestone 5 at minimum; richer once 7–9 exist.
**Deliverables:** internal reporting UI.
**Acceptance criteria:** CEO/content team can see guide performance and affiliate revenue without querying the database directly.

## Sequencing notes
Milestones 2–3 are the hard prerequisite for nearly everything else — there is no version of Brand/Merchant Intelligence, the Affiliate Engine, Closet/Wishlist, or the AI Stylist that can be honestly built on top of three static JS files. Milestone 1 (this pass) intentionally did not attempt to skip ahead to those.
