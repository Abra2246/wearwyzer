# WearWyzer — Feature Inventory

Every feature below was checked against the actual code and, where feasible, against a live run of the site (headless Chromium via Playwright over a local static server). Status values: **Working**, **Broken**, **Partial**, **Dead code**.

## Critical — broken in production today

### Guide #3 (Barrel Pants x NB 530) is non-functional
- **Page:** `guide-barrel-pants-nb530.dc.html` (178 lines)
- **Status: Broken.**
- **Evidence:** the file has zero occurrences of `data-dc-script` (`grep -c "data-dc-script" guide-barrel-pants-nb530.dc.html` → `0`), meaning it has no `class Component extends DCLogic` controller at all — just the template markup with unbound `{{ verdict }}`, `{{ title }}`, `{{ outfits }}`, `{{ slides }}`, `{{ shopProducts }}`, `{{ related }}`, `{{ styleNotes }}` etc. Loading it live confirms the failure: the runtime itself logs `[dc-runtime] guide-barrel-pants-nb530: {{ heroMeta }} never resolved — rendered as empty` (and four more identical warnings, one per top-level binding), and the rendered page shows a blank cover image, no headline, no verdict text, an empty carousel, and an empty outfits list. Screenshot captured during this audit confirms the visual break.
- **Root cause:** `js/guides.js` contains only 2 real guide objects (`on-cloud-x4`, `nb9060-zara-polo`) plus 1 `comingSoon` placeholder — the `barrel-pants-nb530` guide object was never added. The other two guide pages (`guide-on-cloud-x4.dc.html`, `guide-nb9060.dc.html`) both have a working controller that does `gm.guides.find(g => g.id === GUIDE_ID)`; guide #3's page has no such code to even attempt that lookup.
- **Downstream effect:** because `guides.dc.html` (the library page) filters `m.guides.filter(g => !g.comingSoon)`, guide #3 never appears in the library, in search, or in "related guides" carousels on other pages — it is invisible in every discovery surface, and broken even when reached by direct URL.
- **Contradicts:** `CHANGELOG.md` ("2026-07-11 — Guide #3: Added style guide: NB 530 barrel pants") and `ENGINEERING_AUDIT.md`'s feature table ("3 published style guide pages … Built") both claim this guide is complete. It is not — this is the one place where the pre-existing root-level audit's claims and the actual code diverge.
- **9 products** in `js/products.js` set `featuredInGuides: ["barrel-pants-nb530"]` — a guide ID that doesn't exist in `js/guides.js`. This is a dangling reference with no runtime crash (nothing currently reads `featuredInGuides` to resolve it back to a guide object), but it means those 9 products' "featured in" relationship is unrepresented anywhere in the live UI.

## Data-integrity bugs (verified by cross-referencing `js/guides.js` against `js/products.js`)

A script was run to resolve every `productId` referenced inside `guides.js` outfits against the `id` list in `products.js`. All references resolve (no 404-style dangling IDs), but three resolve to the **wrong product**:

| Guide | Outfit | Item label | `productId` used | Actually resolves to |
|---|---|---|---|---|
| `nb9060-zara-polo` | Artist Off-Duty | "Silver Bracelet (Mango Man)" | `mango-sunglasses` | Round Sunglasses |
| `nb9060-zara-polo` | Campus Classic | "Baseball Cap (Uniqlo)" | `uniqlo-crossbody-black` | Crossbody Bag |
| `nb9060-zara-polo` | Dinner Terrace | "Minimal Watch (Mango Man)" | `mango-sunglasses` | Round Sunglasses |

**Effect:** on the "Zara Knit Polo x NB 9060" guide page, the "Shop ↓" link for a bracelet points at a pair of sunglasses' image/card, the "Shop ↓" for a cap points at a crossbody bag, and the "Shop ↓" for a watch points at sunglasses again. This is a real, user-visible mismatch between what the outfit description says and what the shop link resolves to. It is the concrete instance of the risk `ENGINEERING_AUDIT.md` §7 already named abstractly ("no validation that `productId` references resolve … a typo silently breaks a Shop link") — this audit found the specific typos.

No product/brand names contain any auto-correctable pattern here (`mango-sunglasses` and `uniqlo-crossbody-black` are simply the wrong existing IDs, not typos of a missing one) — the correct products for "Silver Bracelet," "Baseball Cap," and a Mango Man watch don't currently exist in `js/products.js` at all, so fixing this requires either adding the missing products or correcting the outfit copy to match products that do exist.

## Cross-page linking bug

- **Files:** `shop.dc.html` (`Component.renderVals`, `guideHref: 'guide-on-cloud-x4.dc.html'`) and `products.dc.html` (same pattern, `guideHref: 'guide-on-cloud-x4.dc.html'`).
- **Status: Broken (silent).**
- Both files hardcode every product card's "View the Style Guide" / "Featured in a guide →" link to guide #1, regardless of which guide the product actually belongs to. A shopper looking at the NB 9060 sneaker on the Shop or Products page and clicking through to "see the guide" lands on the unrelated On Cloud X 4 guide instead. This affects every product except those actually featured in guide #1 (12 of the current 29 products).

## Minor / cosmetic

- **Dead filter chip:** `guides.dc.html`'s `FILTERS` array includes `'Jackets'`, which does not exist as a category or tag on any current guide or product (`js/products.js`'s `CATEGORIES` has `Outerwear`, not `Jackets`). Clicking it always returns zero results.
- **Sitemap incompleteness:** `sitemap.xml` lists only `guide-on-cloud-x4` among the three guide detail pages; `guide-nb9060` and `guide-barrel-pants-nb530` are absent. (Separately, it uses `.html` extensions rather than `.dc.html`, which the README frames as intentional for a post-export production build — but as it stands today it doesn't fully describe either the dev filenames or the full page set.)
- **Transient console 404:** every guide detail page briefly requests the literal string `/%7B%7B%20coverImage%20%7D%7D` as an image URL before hydration replaces it. Non-fatal, covered by the placeholder shimmer, but real (see `docs/CURRENT_STATE.md` §5).

## Confirmed working

| Feature | Where | Verified how |
|---|---|---|
| Home page (hero, featured guide, problem grid, latest guides, shop categories, trust section, email capture form) | `index.dc.html` | Live render, no console errors |
| Guide library search + tag filters | `guides.dc.html` | Live render; logic reviewed (substring match over in-memory array) |
| Guide detail pages #1 and #2 (carousel, outfit breakdowns, shop-the-look, style notes, related guides, JSON-LD) | `guide-on-cloud-x4.dc.html`, `guide-nb9060.dc.html` | Live render, no console errors beyond the harmless transient 404 noted above |
| Shop storefront (search + category/occasion/price/exact-vs-similar filters) | `shop.dc.html` | Live render; filter logic reviewed line-by-line |
| Featured Products profiles + supporting-pieces index | `products.dc.html` | Live render; only products with a `.profile` object get a full profile card (by design) |
| Contact form client-side validation + real honeypot field (`c-website`, `tabIndex="-1"`, checked before submit) | `contact.dc.html` | Code confirms honeypot is real, not just claimed |
| Accessibility basics: skip link, `aria-current`/`aria-pressed`, `prefers-reduced-motion` handling | Every page, `Site Nav.dc.html` | Confirmed present in every file read |
| Legal pages with honest `[BRACKETED]` placeholders instead of invented entity data | `privacy.dc.html`, `terms.dc.html`, `affiliate-disclosure.dc.html` | Confirmed |
| 404 page | `404.dc.html` | Live render |
| Shared nav/footer via `<dc-import>` | `Site Nav.dc.html`, `Site Footer.dc.html` | Confirmed rendering correctly on every page tested, including the space in the filename |

## Dead code

| Item | Status | Evidence |
|---|---|---|
| `image-slot.js` (686 lines) | Dead code | No `.dc.html` file loads it via `<script src>`; no page contains an `<image-slot>` element. It's the design tool's own image-upload widget, not part of the live site. |
| `uploads/` (49 files, 84 MB) | Dead weight | No file in the repo references the `uploads/` path. 21 of 49 are exact MD5 duplicates of files already in `assets/images/`; the remainder appear to be uncropped/raw source drops. |
| `.thumbnail` | Unused | An auto-generated preview JPEG, not referenced by any page. |
