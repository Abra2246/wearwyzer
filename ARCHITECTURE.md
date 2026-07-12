# WearWyzer — Architecture

This describes the system as it exists today, and the incremental path toward the multi-feature platform described in the product roadmap. It intentionally avoids proposing a rewrite — see `ENGINEERING_AUDIT.md` for how we got here.

## Current architecture (as-is)

```
Browser
 └── loads a .dc.html page
      ├── renders inline-styled template
      ├── controller class holds page-local UI state (search text, active filters, form state)
      └── dynamic import() pulls content from js/site-data.js, js/guides.js, js/products.js
```

No network calls beyond font/image loads. No server. No build step. Every page is independently viewable.

Shared UI (`Site Nav.dc.html`, `Site Footer.dc.html`) is composed into every page via `<dc-import>` — this is the one form of real componentization in the codebase today, and it works well.

## Recommendation 1 — Guide pages: template + router, not copy-pasted files
**Current state:** each style guide is a fully duplicated `.dc.html` file; only a `GUIDE_ID` constant and the `<helmet>` meta differ.
**Problem:** a bug fix or design change to the guide layout must be manually re-applied to every guide file. This is already a manual chore at 3 guides and becomes untenable past ~15–20.
**Proposed solution:** introduce one `guide-template.dc.html` that reads `?guide=<id>` (or a path segment, once real routing/hosting exists) and renders any guide from `js/guides.js`. Keep today's per-guide files only as thin redirects for existing bookmarked/shared URLs, or drop them once URLs can be rewritten at the host level.
**Benefit:** new guides become a pure data change — no new template file, no risk of the copies drifting apart.
**Migration effort:** Low–Medium. The guide template logic already reads everything from `js/guides.js`; the only work is parameterizing `GUIDE_ID` from the URL instead of hardcoding it, and deciding on a routing strategy for the static host.
**Priority: High.**

## Recommendation 2 — Move content ownership off hand-edited JS files
**Current state:** guides/products/prices/affiliate links are edited directly in `js/*.js` by whoever has repo access.
**Problem:** doesn't scale past one or two content editors; no validation (a broken `productId` reference fails silently), no history, no draft/review step before publishing.
**Proposed solution:** introduce a headless CMS or a lightweight custom admin (this is the "Editorial CMS" from the roadmap) that writes to a real database, with `js/guides.js`/`products.js` regenerated from it (or replaced by an API call) at build or request time.
**Benefit:** unlocks multi-person content ops, an audit trail, and is the prerequisite for Product/Brand/Merchant Intelligence and the Affiliate Engine (none of which can exist as flat JS files).
**Migration effort:** High — this is genuine backend work (database schema, API, auth, admin UI), not a front-end change.
**Priority: High, but sequenced after Recommendation 1** (no reason to build a CMS around a content shape that's about to change).

## Recommendation 3 — Real search
**Current state:** substring match over an array already downloaded to the browser.
**Problem:** fine today; breaks down as the catalog grows past what's reasonable to ship in every page load, and can't support the roadmap's "Product Search" as a first-class feature (ranking, typo tolerance, faceting at scale).
**Proposed solution:** once there's a real backend/database (Recommendation 2), move search to a server-side index (Postgres full-text to start; a dedicated search service like Meilisearch/Algolia only if/when catalog size and query volume justify it).
**Benefit:** search that scales with catalog size instead of page-load size.
**Migration effort:** Medium, but blocked on Recommendation 2 existing first.
**Priority: Medium.**

## Recommendation 4 — Affiliate Engine as a real system, not a field on a product object
**Current state:** `affiliateUrl` is a single hardcoded string per product.
**Problem:** can't represent multiple retailers per product, can't track clicks, can't rotate/expire links, can't attribute revenue per guide.
**Proposed solution:** a `retailers` table (product → many retailer offers, each with its own URL/price/status) plus a redirect endpoint (`/go/:offerId`) that logs the click before forwarding — this is the actual foundation of an "Affiliate Engine" and of any future Analytics Dashboard.
**Benefit:** real attribution data, multi-retailer comparison, and a single place to update/rotate links instead of scattering them across data files (this also directly satisfies "no hardcoded affiliate links scattered across HTML," which is already true today — links live in `js/products.js`, not in markup — but should stay true as the system grows).
**Migration effort:** Medium once a backend exists; High if attempted before one does.
**Priority: High, once Recommendation 2 lands.**

## Recommendation 5 — AI Stylist / Outfit Builder / Closet / Wishlist
**Current state:** none of these exist in any form; guides are hand-authored outfit combinations, not a queryable outfit graph.
**Problem:** these features need (a) a real Product Intelligence database with structured attributes (color, category, formality, season) and (b) a real Outfit Intelligence database describing which items combine and why — neither exists yet.
**Proposed solution:** do not start here. These features are downstream of Recommendations 1–4. Trying to build an AI Stylist on top of three flat JS files would mean rebuilding it again the moment a real database exists.
**Priority: Low for now** — explicitly sequenced last in `ROADMAP.md`.

## Non-recommendations (things we're deliberately not changing)

- **Inline styles / no CSS framework:** works fine at current page count; not a scalability bottleneck worth solving speculatively.
- **No TypeScript today:** worth introducing once there's a real API contract to type (Recommendation 2), not before — typing three ad hoc JS arrays isn't valuable on its own.
