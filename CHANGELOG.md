# Changelog

All notable changes to this project are recorded here.

## Unreleased
### Added
- `ENGINEERING_AUDIT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT.md`, `CONTRIBUTING.md` — full engineering documentation set for the transition from prototype to platform.
### Removed
- Dead/orphaned files: `Home.dc.html`, `SiteHeader.dc.html`, `SiteFooter.dc.html`, `js/data.js` (superseded, unreferenced duplicate of `Site Nav`/`Site Footer`/`js/site-data.js`), plus two one-off print-export snapshot files.

## 2026-07-12 — Remaining product mismatches resolved + automated content validation
### Fixed
- `js/guides.js`: the last two mismatched guide-item `productId` references from the engineering audit are resolved. Both were investigated using the actual carousel slide images and the guide's own "Shop the Look" flat-lay (slide 7 of `nb9060-zara-polo`), which is the guide's authoritative, price-confirmed shoppable-item list:
  - **"Silver Bracelet (Mango Man)"** (Artist Off-Duty outfit) — slide 3 shows a thin band visibly worn on the model's wrist, but no bracelet of any brand appears in the flat-lay's confirmed 13-item list, and no bracelet product exists anywhere in `js/products.js`.
  - **"Baseball Cap (Uniqlo)"** (Campus Classic outfit) — slide 4 clearly shows a navy baseball cap with a white graphic logo, a completely different color/style than the catalog's only cap ("Neutral Cap," brand-neutral), and no cap of any kind appears in the flat-lay's confirmed list either.
  Since neither item was ever part of the guide's own definitive shoppable set, both were **removed from their outfit's `items` array** rather than linked to an unrelated existing product or represented by an invented product record. Nothing about the outfit's visual styling changed — only the false "Shop ↓" claim was removed. Both outfits now list 4 confirmed, correctly-resolving items instead of 5.
### Added
- `scripts/validate-content-data.mjs` — a dependency-free Node (ESM) script that validates `js/guides.js` against `js/products.js`: every outfit item `productId`, every `relatedProducts` entry, and every `featuredInGuides` entry must resolve; every published guide needs a non-empty `slug` pointing to a real file; no duplicate product or guide ids. It also prints (non-fatal) warnings for asymmetric product↔guide relationships and for guide items whose label shares no meaningful word with the product they resolve to — the exact class of bug this milestone and the previous one both fixed by hand. `js/package.json` (`{"type":"module"}`) was added so Node can import the existing `export const` content files directly; it has no effect on the browser, which never reads `package.json`. Usage documented in `DEVELOPMENT.md` and `CLAUDE.md`.
- Verified: the validator reports 0 structural errors on the current dataset (exit code 0). It surfaces 8 warnings, all tracing back to 4 pre-existing, out-of-scope gaps in Guide #1's `relatedProducts` (`cream-tee`, `cap`, `black-trousers`, `tech-pants` are used in outfits but not listed, so their "Shop ↓" anchors don't resolve to a visible card) — a real, previously undocumented finding, left unfixed here to keep this change scoped to the audit's Part A/B ask, and tracked as a follow-up.
- Confirmed live (local server + headless Chromium): the NB 9060 x Zara Polo guide's Artist Off-Duty and Campus Classic outfits each render their remaining 4 items correctly, every "Shop ↓" link on the page resolves to a real, matching product card, and the full 13-page site sweep shows zero new runtime console warnings and no regressions.

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
