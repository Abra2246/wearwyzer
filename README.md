# WEARWYZER — Site Handbook

"You bought it. Now wear it wyzer."

**What this is today:** a static, front-end content site and affiliate storefront prototype — no backend, no database, no accounts. See `ENGINEERING_AUDIT.md` for a full audit, `ARCHITECTURE.md` for the incremental plan toward a real platform, and `ROADMAP.md` for milestone sequencing. This file stays focused on day-to-day content editing and deployment.

## Local preview
```
./scripts/preview.sh
```
Serves the site at `http://localhost:8000` with Python's built-in HTTP server (no npm, no build step) and opens `index.dc.html` in your default browser on macOS. Pass a port as an argument (e.g. `./scripts/preview.sh 3000`) to use something other than 8000. Stop the server with `Ctrl+C` in the terminal it's running in.

## GitHub Pages preview
Every push to `main` deploys automatically via `.github/workflows/pages.yml`. Preview URL: **https://abra2246.github.io/wearwyzer/**

## Validating before you commit
```
node scripts/validate-content-data.mjs      # js/guides.js <-> js/products.js cross-references
node scripts/qa-static-site.mjs             # local asset/link references in every page
node scripts/validate-knowledge-graph.mjs   # data/*.js Knowledge Graph structural checks
node scripts/compare-legacy-adapter.mjs     # report-only: legacy files vs. graph adapter output
node scripts/validate-hero-product-pages.mjs # js/hero-pages.js registry + recommendation-eligibility checks
```
The first four are plain Node, zero dependencies, and run in CI on every PR and push to `main` (`.github/workflows/content-validation.yml`). `validate-hero-product-pages.mjs` is the same style but **not yet wired into CI** — run it manually when touching `js/hero-pages.js` or a `product-*.dc.html` page (see `DEVELOPMENT.md`).

## Autonomous engineering queue (v1)
```
node --test scripts/__tests__/
```
`scripts/queue-*.mjs` implement the controlled issue → dispatch → PR → review queue described in `docs/AUTONOMOUS_ENGINEERING_V1.md`; see `docs/AUTOMATION_WORKFLOW.md` "Autonomous queue (v1)" for what's implemented, the label contract, and the activation checklist (its scheduled GitHub Actions triggers are staged at `docs/automation/workflows/` pending a maintainer copying them into `.github/workflows/`).

## Mission Control ops dashboard (issue #19)
`ops.dc.html` is a read-only, mobile-first internal status page — automation state (queue depth, active issue/PR, CI, deployment health, guide factory, OpenAI image-renderer budget, incident state) at a glance, refreshed every 60 seconds from `ops/status.json`. It is deliberately **unlinked from public navigation**, carries `noindex, nofollow`, and is `robots.txt`-disallowed — see `docs/OPS_DASHBOARD_V1.md` for the status schema, refresh cadence, what each health/automation state means, and the limitations of unauthenticated static hosting (there is no login; do not treat this as real access control). Generate/refresh the status artifact locally with `node scripts/ops-status-cli.mjs [--dry-run]`; its scheduled refresh workflow is staged (not active) at `docs/automation/workflows/ops-status-refresh.yml` pending a maintainer copying it into `.github/workflows/`.

## Knowledge Graph v1 (additive foundation, now used by one page)
`data/*.js` is an additive, read-only projection of `js/products.js`/`js/guides.js` into a graph of typed entities (brands, retailers, offers, products, outfits, guides, collections) and relationships with confidence/verification metadata. It does not change what any *existing* page renders — see `docs/KNOWLEDGE_GRAPH_V1.md` for the entity/relationship model, `docs/KNOWLEDGE_GRAPH_MIGRATION.md` for the phased plan to eventually make it canonical, and `docs/CURRENT_DATA_TO_GRAPH_MAPPING.md` for the field-by-field audit of how it was derived. One new page, `product-nb-9060-breakfast-tea.dc.html`, reads exclusively from `data/*.js` as the first customer-facing use of the graph — see `docs/HERO_PRODUCT_V1.md`.

## File map
- `index.dc.html` — Home (announcement bar text is editable via Tweaks or `js/site-data.js`)
- `guides.dc.html` — searchable/filterable guide library
- `guide-on-cloud-x4.dc.html` — reusable guide detail template (Post #1)
- `shop.dc.html` — affiliate storefront (search + category/occasion/price/match filters)
- `products.dc.html` — featured product profiles
- `product-nb-9060-breakfast-tea.dc.html` — reusable hero-product page template, reads from `data/*.js` (see `docs/HERO_PRODUCT_V1.md`); registered in `js/hero-pages.js`
- `about.dc.html`, `contact.dc.html`
- `affiliate-disclosure.dc.html`, `privacy.dc.html`, `terms.dc.html`, `404.dc.html`
- `Site Nav.dc.html` / `Site Footer.dc.html` — shared header/footer components
- `js/site-data.js`, `js/guides.js`, `js/products.js` — ALL content lives here
- `robots.txt`, `sitemap.xml`
- `assets/images/…` — placeholder images (labeled "PLACEHOLDER — REPLACE")

## Adding a new Instagram post / style guide
1. Duplicate the first object in `js/guides.js`; update every field (id, title, slug, outfits, tags…).
2. Drop slide images in `assets/images/guides/<id>/` and a cover image.
3. Duplicate `guide-on-cloud-x4.dc.html`, rename to match `slug`, change the
   `GUIDE_ID` constant at the top of its logic, and update the `<helmet>` title/meta.
4. Add the page to `sitemap.xml`.
The library, home "latest" section, and related-guides cards read from `js/guides.js`.

## Adding affiliate links
In `js/products.js`, set `affiliateUrl` (and `retailer`) on the product.
Cards automatically switch from "Link coming soon" to a live "Shop →" button
with `rel="sponsored noopener"`.

## Updating prices / availability
In `js/products.js`: set `price` (number), `priceStatus: "confirmed"`, and
`lastChecked` (date string). Until then the UI honestly shows "Price TBD".

## Assets you still need to add
- Real product + carousel slide photography (replace every PLACEHOLDER image; webp recommended)
- Real Instagram profile URL + post URLs (`js/site-data.js`, `js/guides.js`)
- Real contact email (`js/site-data.js`)
- Affiliate links + retailers + confirmed prices (`js/products.js`)
- Legal entity name + dates in `privacy` / `terms` / `affiliate-disclosure` ([BRACKETED] placeholders)
- Email provider for the newsletter form; form backend (Formspree / Netlify Forms) for contact
- Real domain in `robots.txt` + `sitemap.xml`

## Deployment (after exporting to static HTML)
- **Netlify:** drag the folder into app.netlify.com, or `netlify deploy --prod`. Add a `_redirects` file with `/* /404.html 404` for the 404 page. Contact form can use Netlify Forms (add `data-netlify="true"`).
- **Vercel:** `vercel --prod` from the folder. 404 works automatically if the file is named `404.html`.
- **GitHub Pages:** automated — see "GitHub Pages preview" above. `.github/workflows/pages.yml` deploys on every push to `main`; requires the one-time repo setting described in `docs/AUTOMATION_WORKFLOW.md` (Settings → Pages → Source → GitHub Actions).

## Repository status
Connected to GitHub at `abra2246/wearwyzer`. See `docs/AUTOMATION_WORKFLOW.md` for the issue-driven engineering workflow this repo is set up for.
