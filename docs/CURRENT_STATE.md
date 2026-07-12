# WearWyzer — Current State

This document describes exactly what exists in the repository today, verified by reading every file, running a live cross-reference check of the data files, and booting the site in a real browser (Playwright/Chromium against a local static server). It supersedes nothing — it is an independent verification pass layered on top of the pre-existing root-level docs (`ENGINEERING_AUDIT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT.md`, `CONTRIBUTING.md`, `CHANGELOG.md`), which were already present in the single "Initial commit" and are addressed directly in `docs/ENGINEERING_AUDIT.md`.

## 1. What this repository is

A static, front-end-only prototype of a men's affiliate style-guide site, originally produced with Claude's website-design ("dc") tool. There is no backend, no database, no build step, no package manager, and no CI. It is version-controlled in git but has one commit total (`47affa0`, "Initial commit: WearWyzer site") — there is no development history to mine; everything, including the pre-existing docs, arrived at once.

## 2. Technology stack (verified)

| Layer | What's actually there |
|---|---|
| Markup/logic | `*.dc.html` files: an `<x-dc>` template block (HTML + `{{ }}` interpolation + `sc-for`/`sc-if` directives) plus a sibling `<script type="text/x-dc" data-dc-script">` containing a `class Component extends DCLogic` controller. |
| Runtime | `support.js` (1,687 lines), a **generated, vendored build artifact**. Its own header says: `// GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with \`cd dc-runtime && bun run build\`.` The `dc-runtime` source directory does not exist anywhere in this repo — only the compiled output is checked in. |
| UI framework | React 18.3.1 + ReactDOM, loaded at runtime from `unpkg.com` as UMD bundles (`support.js:1594-1618`) — not bundled, not vendored, not pinned via lockfile. |
| Transpilation | Babel Standalone 7.29.0, also loaded from `unpkg.com` at runtime (`support.js:1048`), used to JSX/TS-transpile page logic **in the browser, on every page load**. |
| Componentization | `<dc-import name="Site Nav">` / `<dc-import name="Site Footer">` — fetches the named `.dc.html` file at runtime and inlines it. This is the only real componentization in the codebase. |
| Data | Three plain ES modules under `js/` (`site-data.js`, `guides.js`, `products.js`), loaded via dynamic `import()` from each page's controller. |
| Styling | 100% inline `style="..."` attributes plus `style-hover=`/`style-focus=` custom attributes (a `support.js` convention). No CSS files, no framework, no build step. |
| Fonts | Google Fonts (Oswald) via `<link>` per page. |
| Image upload widget | `image-slot.js` (686 lines) implements a `<image-slot>` custom element for the design tool's own drag-and-drop image workflow (writes to a `.image-slots.state.json` sidecar via `window.omelette`). **Confirmed unused** — no `.dc.html` file references `image-slot.js` via `<script src>`, and no page contains an `<image-slot>` tag. |
| Hosting/CI | None configured. No `package.json`, no lockfile, no `.gitignore`, no CI workflow files anywhere in the repo. |

## 3. How a page actually loads (traced through `support.js`)

1. Browser requests e.g. `index.dc.html`. The only script tag is `<script src="./support.js">`.
2. `support.js` boots, checks for `window.React`/`window.ReactDOM`; if absent it fetches the UMD builds from `unpkg.com`, then Babel Standalone.
3. It parses the `<x-dc>` block and the sibling `data-dc-script` content, transpiles the controller class with Babel, and mounts it as a React root.
4. `<dc-import>` tags trigger a `fetch()` of the named component file (e.g. `Site Nav.dc.html`) and recursively parse/mount it inline.
5. `componentDidMount()` in most page controllers performs a dynamic `import('./js/*.js')` to pull in content data, then re-renders.

This means the site **can** run by simply opening a `.dc.html` file over any static file server (confirmed — see §5), but it requires a live internet connection to `unpkg.com` on every first load in every browser session (no offline mode, no SRI hashes on the CDN scripts, no version lock beyond the URL's embedded version string).

## 4. Inventory of pages, components, scripts, data, assets

### Pages (`*.dc.html`, 15 total)
| File | Purpose | Verified status |
|---|---|---|
| `index.dc.html` | Home | Renders correctly |
| `guides.dc.html` | Style guide library, client-side search/filter | Renders correctly; only lists guides present in `js/guides.js` (2 of the 3 that exist as pages — see `docs/FEATURE_INVENTORY.md`) |
| `guide-on-cloud-x4.dc.html` | Guide #1 detail (template + `GUIDE_ID` pattern) | Renders correctly |
| `guide-nb9060.dc.html` | Guide #2 detail | Renders correctly |
| `guide-barrel-pants-nb530.dc.html` | Guide #3 detail | **Broken — no controller logic at all. See `docs/FEATURE_INVENTORY.md` §Critical.** |
| `shop.dc.html` | Affiliate storefront, search + 4 filter types | Renders correctly; has a data bug (see Technical Debt) |
| `products.dc.html` | Featured product profiles + supporting-pieces index | Renders correctly |
| `about.dc.html` | About | Renders correctly |
| `contact.dc.html` | Contact form (client validation + real honeypot field, no backend) | Renders correctly |
| `affiliate-disclosure.dc.html`, `privacy.dc.html`, `terms.dc.html` | Legal, with `[BRACKETED]` placeholders for unconfirmed entity info | Render correctly |
| `404.dc.html` | Not-found page | Renders correctly |
| `Site Nav.dc.html` | Shared header, composed via `<dc-import>` | Renders correctly on every page |
| `Site Footer.dc.html` | Shared footer, composed via `<dc-import>`, reads `js/site-data.js` | Renders correctly on every page |

### Scripts
- `support.js` — the dc-runtime, vendored/generated (see §2).
- `image-slot.js` — dead code, unused (see §2).
- `js/site-data.js` (24 lines) — brand name, tagline, Instagram URL, contact email, disclosure copy. Contains explicit `TODO` markers for the still-placeholder Instagram URL and contact email.
- `js/guides.js` (245 lines) — array of guide objects (outfits, items, slide images, tags). **Only contains 2 real guides**, not 3 (see Technical Debt / Feature Inventory).
- `js/products.js` (584 lines) — array of product objects (price, retailer, affiliate URL, tags, optional `profile` block) plus `CATEGORIES`/`OCCASIONS` constant arrays.

### Assets
- `assets/logo/` — real WearWyzer wordmark (black + white PNGs).
- `assets/favicon.png`.
- `assets/images/guides/<id>/slide-0N.png` — carousel slides per guide, plus a `<id>-cover.png` per guide that is a **byte-identical duplicate** of `slide-01.png` in every case (verified via `md5`).
- `assets/images/products/*.png` — one image per product in `js/products.js`.
- `uploads/` (49 files, **84 MB**) — UUID-named PNGs. **Confirmed unreferenced anywhere in the codebase** (no `.dc.html`, no `.js` file contains the string `uploads/`). 21 of the 49 are exact-content duplicates (by MD5) of files already living under `assets/images/`; the rest appear to be raw/uncropped source drops from the design tool's image workflow that were never cleaned up.
- `.thumbnail` (36 KB JPEG) — an auto-generated preview image, not referenced by the live site.

### Config/meta
- `robots.txt`, `sitemap.xml` — both contain `TODO: replace with your real domain` and reference `.html` paths (not `.dc.html`); `sitemap.xml` lists only 1 of the 3 guide detail pages.

## 5. Local run verification

The site was actually launched — `python3 -m http.server` on the repo root, then every `.dc.html` page was loaded in headless Chromium via Playwright, with console/page-error capture and screenshots.

**Result: 12 of 13 pages tested render correctly with no fatal JS errors.** The one exception, `guide-barrel-pants-nb530.dc.html`, renders with every dynamic field empty (no title, no cover image, no outfits, no verdict text) and the runtime itself logs explicit warnings per unresolved binding (e.g. `[dc-runtime] guide-barrel-pants-nb530: {{ title }} never resolved — rendered as empty`). Root cause and screenshot are in `docs/FEATURE_INVENTORY.md`.

A recurring, non-fatal console 404 was observed on every guide detail page for a literal request to `/%7B%7B%20coverImage%20%7D%7D` (i.e., the browser eagerly requests the raw `{{ coverImage }}` string as an image URL before the runtime hydrates and replaces it). This appears to be a harmless artifact of the runtime's initial-HTML-then-hydrate approach, not a user-visible defect — the placeholder shimmer covers it in practice — but it is worth knowing about if `dc-runtime` is ever revisited.

No changes were made to any file during this audit, per instruction.
