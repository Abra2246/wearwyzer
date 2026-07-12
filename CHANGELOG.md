# Changelog

All notable changes to this project are recorded here.

## Unreleased
### Added
- `ENGINEERING_AUDIT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT.md`, `CONTRIBUTING.md` — full engineering documentation set for the transition from prototype to platform.
### Removed
- Dead/orphaned files: `Home.dc.html`, `SiteHeader.dc.html`, `SiteFooter.dc.html`, `js/data.js` (superseded, unreferenced duplicate of `Site Nav`/`Site Footer`/`js/site-data.js`), plus two one-off print-export snapshot files.

## 2026-07-12 — Product/guide link integrity fixes
### Fixed
- `js/guides.js`: corrected the "Minimal Watch (Mango Man)" outfit item in the NB 9060 x Zara Polo guide (Dinner Terrace outfit), which previously referenced `productId: "mango-sunglasses"` (Round Sunglasses) instead of `productId: "minimal-watch"` (the only watch product in the catalog). Added `minimal-watch` to that guide's `relatedProducts` so the item's "Shop ↓" link resolves to a real card; added `nb9060-zara-polo` to `minimal-watch`'s `featuredInGuides` in `js/products.js` for consistency. Verified live: the item now links to a card that actually shows "Minimal Watch," and a full `productId`/`relatedProducts`/`featuredInGuides` cross-reference validation script reports 0 unresolved references (down from 1 for this item).
- `shop.dc.html`, `products.dc.html`: every product's "Featured in a guide →" / "View the Style Guide" link previously pointed at `guide-on-cloud-x4.dc.html` unconditionally. Both pages now derive the link from the product's real `featuredInGuides` relationship: the first entry that resolves to a real, published (non-`comingSoon`) guide wins (documented, deterministic — see `resolveGuideForProduct` in each file). A product with no resolvable guide falls back to the guide library (`guides.dc.html`) with an honest label ("Browse all guides →" / "Browse Style Guides") instead of linking to an unrelated specific guide. Verified live across all 33 products in the catalog: every product now links to its own guide (12 → Guide #1, 13 → Guide #2, 8 → Guide #3, several products shared across multiple guides resolve deterministically to the first listed guide); no product currently hits the no-guide fallback path, but the fallback logic was unit-verified in isolation for that case. No new runtime console warnings on either page or on any of the 3 guide pages.

### Known, not fixed (reported, not fabricated)
- Two guide-item `productId` references in the NB 9060 x Zara Polo guide still resolve to the wrong product — "Silver Bracelet (Mango Man)" and "Baseball Cap (Uniqlo)" both currently point at existing-but-wrong products (`mango-sunglasses`, `uniqlo-crossbody-black`). No bracelet product of any brand, and no Uniqlo-branded cap, exist anywhere in `js/products.js`. Per the audit's no-fabrication rule, these were left unchanged rather than force-mapped to an unrelated existing product or a newly invented one. Needs either new product records (real photography/pricing/affiliate data) or a guide-copy correction — a content decision, not an engineering one.

## 2026-07-11 — Guide #3
- Added style guide: NB 530 barrel pants (`guide-barrel-pants-nb530.dc.html`).

## 2026-07-09 — Guide #2
- Added style guide: Zara hemp cotton knit polo × New Balance 9060 "Breakfast Tea" (`guide-nb9060.dc.html`).

## Earlier — Brand refresh
- Replaced text wordmark with the real WearWyzer logo mark (nav, footer, favicon).

## Earlier — Initial build
- Home, Style Guides library, Guide #1 (On Cloud X 4), Shop, Featured Products, About, Contact, legal pages (Privacy, Terms, Affiliate Disclosure), 404.
- Content data model (`js/site-data.js`, `js/guides.js`, `js/products.js`).
- Accessibility baseline: skip link, focus states, aria-current/aria-pressed, reduced-motion, honeypot + validated contact form.
- SEO baseline: per-page meta, Open Graph, Article/Breadcrumb JSON-LD, `robots.txt`, `sitemap.xml`.
