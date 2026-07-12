# WearWyzer — Development Guide

## Running the site locally
There is no build step. Every `.dc.html` file is a complete, self-contained page — open it directly in a browser, or serve the folder with any static file server.

## Where content lives
All editable content is in three files under `js/`:
- `js/site-data.js` — brand name, tagline, announcement bar, contact email, affiliate disclosure copy, Instagram URL.
- `js/guides.js` — one object per style guide: outfits, items, style notes, slide images, tags.
- `js/products.js` — one object per product: price, retailer, affiliate URL, tags, styling profile.

Never edit content by hand-writing it into a `.dc.html` template — it should always be sourced from these files so the library/search/related-guide surfaces stay in sync automatically.

## Adding a new style guide
1. Duplicate the first object in `js/guides.js`. Fill in every field — `id`, `title`, `slug`, `outfits`, `slideImages`, `tags`, etc.
2. Add cover + slide images under `assets/images/guides/<id>/`.
3. Duplicate `guide-on-cloud-x4.dc.html`, rename to match the new `slug`, and change the `GUIDE_ID` constant at the top of its controller class.
   *(This manual-duplication step is tracked as technical debt — see `ARCHITECTURE.md`, Recommendation 1. Milestone 2 replaces it with a single data-driven template.)*
4. Add the new page's URL to `sitemap.xml`.

## Adding a product / affiliate link
In `js/products.js`, add or edit a product object. Set `affiliateUrl` and `retailer` once a real link exists — until then, leave both `""` and the UI will render an honest "Link coming soon" state instead of a dead or fake link.

## Updating a price
Set `price` (a number), `priceStatus: "confirmed"`, and `lastChecked` (a date string) on the product. Leaving `price: null` renders "Price TBD" — never fabricate a number.

## Content integrity rules (do not violate these)
- Never hardcode a real price unless it's been confirmed.
- Never invent an affiliate URL, sponsorship, or availability claim.
- Never recommend a product because of commission rather than fit.
- Every unknown value gets an honest placeholder state, not a guess.

## Code conventions
- Styling is inline only — no CSS files, no utility classes. Match the existing cream/black/gold palette and Oswald display type already used across every page rather than introducing new colors or fonts.
- Shared chrome (`Site Nav.dc.html`, `Site Footer.dc.html`) is composed via `<dc-import>` — extend those files rather than re-implementing nav/footer markup on a page.
- Keep content and template separated: if you're tempted to hardcode a guide/product detail directly into a page's markup, it belongs in `js/guides.js` or `js/products.js` instead.
