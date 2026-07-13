# WearWyzer — Development Guide

## Running the site locally
There is no build step. Every `.dc.html` file is a complete, self-contained page — open it directly in a browser, or serve the folder with any static file server.

The fastest way:
```
./scripts/preview.sh
```
This starts Python's built-in HTTP server on port 8000 (no npm, no dependencies) and opens `index.dc.html` in your default browser on macOS. Pass a port number as an argument to use something else (`./scripts/preview.sh 3000`). Stop it with `Ctrl+C` in the terminal it's running in.

## Previewing on GitHub Pages
Every push to `main` deploys automatically via `.github/workflows/pages.yml` to **https://abra2246.github.io/wearwyzer/**. See `docs/AUTOMATION_WORKFLOW.md` for the full issue → PR → preview → merge workflow this is part of.

## Where content lives
All editable content is in three files under `js/`:
- `js/site-data.js` — brand name, tagline, announcement bar, contact email, affiliate disclosure copy, Instagram URL.
- `js/guides.js` — one object per style guide: outfits, items, style notes, slide images, tags.
- `js/products.js` — one object per product: price, retailer, affiliate URL, tags, styling profile.

Never edit content by hand-writing it into a `.dc.html` template — it should always be sourced from these files so the library/search/related-guide surfaces stay in sync automatically.

## Validating content data
Before committing any change to `js/guides.js` or `js/products.js`, run:
```
node scripts/validate-content-data.mjs
```
No install step — it's plain Node (ESM, zero dependencies). It checks that every `productId`/`relatedProducts`/`featuredInGuides` reference actually resolves, that every published guide has a slug pointing to a real page file, that there are no duplicate ids, and flags (as warnings, not failures) product-guide relationships that don't line up symmetrically and guide items whose label doesn't obviously match the product they resolve to. Exit code `0` = no structural errors (warnings may still print and are worth reading — always eyeball them before committing); exit code `1` = a structural error was found and must be fixed. See the comment header at the top of the script for the full list of checks.

## Validating static assets and links
Before committing any change that adds or renames a page, image, or local reference, run:
```
node scripts/qa-static-site.mjs
```
Also plain Node, zero dependencies. It scans every `*.dc.html` page and `index.html` for local `href`/`src` values and `<dc-import>` names, and confirms each one resolves to a real file — **case-sensitively**, even though this is normally run on macOS (case-insensitive filesystem), because GitHub Pages serves from a case-sensitive Linux host. Dynamic `{{ binding }}` values (resolved at runtime from `js/guides.js`/`js/products.js`) are skipped — that's `scripts/validate-content-data.mjs`'s job, not this script's.

## Validating the Knowledge Graph v1 additive foundation
Also before committing any change to `js/guides.js` or `js/products.js`, run:
```
node scripts/validate-knowledge-graph.mjs
```
`data/*.js` is a set of additive modules (brands, retailers, offers, products, outfits, guides, collections, relationships) derived from `js/products.js`/`js/guides.js` at import time — see `docs/KNOWLEDGE_GRAPH_V1.md`. No page reads from `data/*.js` yet, so nothing user-visible depends on this passing, but it's the same guarantee as the two validators above applied to the graph shape: unique ids/slugs, every cross-entity reference resolves, taxonomy/relationship vocabulary is approved, and commerce facts stay unpublished rather than fabricated. Since `data/*.js` is computed from the same two files, this should normally pass whenever `scripts/validate-content-data.mjs` does — a failure here usually points at an edge case in how the graph derives a field (e.g. an outfit item whose `productId` doesn't resolve to a real product), which the error message names directly.

To see how the graph's `data/adapters.js` would reproduce the current `js/products.js`/`js/guides.js` contract (useful before/after any change to how a field is derived), run:
```
node scripts/compare-legacy-adapter.mjs
```
Report-only — it always exits 0. See `docs/CURRENT_DATA_TO_GRAPH_MAPPING.md` "Intentional adapter differences" for the handful of differences that are expected, and `docs/KNOWLEDGE_GRAPH_MIGRATION.md` for the plan to eventually have a page read from the graph instead of `js/*.js` directly.

## Validating hero product pages
Before committing any change to `js/hero-pages.js` or a `product-*.dc.html` page, run:
```
node scripts/validate-hero-product-pages.mjs
```
Plain Node, zero dependencies. Checks every `js/hero-pages.js` registry entry's product id resolves in `data/products.js`, its page file exists on disk, and its controller's `PRODUCT_ID` constant matches the registry (catches copy/paste drift when a page is duplicated for a new product). Also regression-tests `data/taxonomies.js`'s `isPubliclyRecommendable()` gate against every relationship in the graph, including the one known `draft`/`unverified` edge, so a future change can't silently start surfacing an unverified relationship as a public recommendation. **Not yet wired into `.github/workflows/`** — run it manually until a maintainer with workflow-edit access adds it alongside the other four validators.

## Adding a new hero product page
See `docs/HERO_PRODUCT_V1.md` for the selection rationale behind the first page and exactly which graph relationships it renders.
1. Duplicate `product-nb-9060-breakfast-tea.dc.html`, change the `PRODUCT_ID` constant at the top of its controller, and update the `<helmet>` title/meta/schema text.
2. Add an entry to `js/hero-pages.js` (`productId → filename`) so nav links on `products.dc.html`, `shop.dc.html`, and the product's guide page pick it up automatically.
3. Add the new page's URL to `sitemap.xml`.
4. Run `node scripts/validate-hero-product-pages.mjs` and `node scripts/validate-knowledge-graph.mjs`.
Only build a page for a product whose relationships are already `verified` in `data/relationships.js` — a `draft`/`unverified`/low-confidence relationship should never be the basis of a page section (see `data/taxonomies.js` `isPubliclyRecommendable()`).

## Autonomous engineering queue (v1)
`scripts/queue-labels.mjs`, `scripts/queue-dispatch.mjs`, and `scripts/queue-pr-state.mjs` implement the controlled issue-selection/dispatch/PR-state queue described in `docs/AUTONOMOUS_ENGINEERING_V1.md`. They're plain Node ESM, zero dependencies, and read `GITHUB_TOKEN`/`GITHUB_REPOSITORY` from the environment (the workflow's own token — no new secret). Run their tests with:
```
node --test scripts/__tests__/
```
See `docs/AUTOMATION_WORKFLOW.md` "Autonomous queue (v1)" for the label contract, the guarded (disabled-by-default) low-risk auto-merge gate, and the activation checklist for the staged workflow files under `docs/automation/workflows/`.

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
