# WearWyzer — Engineering Audit
Date: 2026-07-11

## 1. What this project actually is today

WearWyzer currently exists as a **static, front-end-only marketing and content site** — a high-fidelity prototype, not a platform. There is no backend, no database, no authentication, no server-rendered logic, and no real API. Every "dynamic" behavior (search, filters, forms) runs entirely in the browser against hardcoded JS data files.

This audit is written against that reality. It does not assume infrastructure that doesn't exist yet.

## 2. Tech stack

- **Markup/logic:** Component files (`*.dc.html`) — each is a self-contained template + a small class-based JS controller, compiled client-side by a shared runtime (`support.js`).
- **Styling:** 100% inline styles, no CSS framework, no build step, no CSS files.
- **Data:** Plain ES modules (`js/site-data.js`, `js/guides.js`, `js/products.js`), imported dynamically at runtime via `import()`.
- **Fonts:** Google Fonts (Oswald) loaded per-page via `<link>`.
- **No package manager, no bundler, no server.** Every page is viewable by opening the `.dc.html` file directly.
- **Hosting:** none configured yet. No CI/CD. GitHub is not yet connected to this project.

## 3. Folder structure (as of this audit)

```
/
├── index.dc.html                     Home
├── guides.dc.html                    Style guide library (search/filter)
├── guide-on-cloud-x4.dc.html         Guide #1 — On Cloud X 4
├── guide-nb9060.dc.html              Guide #2 — Zara knit polo x NB 9060
├── guide-barrel-pants-nb530.dc.html  Guide #3 — NB 530 barrel pants
├── shop.dc.html                      Affiliate storefront
├── products.dc.html                  Featured product profiles
├── about.dc.html / contact.dc.html
├── affiliate-disclosure.dc.html / privacy.dc.html / terms.dc.html / 404.dc.html
├── Site Nav.dc.html / Site Footer.dc.html   Shared header/footer components
├── js/
│   ├── site-data.js     Brand name, tagline, announcement bar, disclosure text
│   ├── guides.js        One object per style guide (outfits, items, tags, slides)
│   └── products.js      One object per product (price, affiliate URL, tags)
├── assets/
│   ├── logo/            Real WearWyzer wordmark (black + white)
│   ├── favicon.png
│   └── images/guides/…  Carousel slide images (mix of real + placeholder)
├── robots.txt / sitemap.xml
└── README.md
```

**Cleanup performed in this audit:** deleted `Home.dc.html`, `SiteHeader.dc.html`, `SiteFooter.dc.html`, and `js/data.js` — an orphaned, unreferenced duplicate of the nav/footer/data system, superseded by `Site Nav.dc.html` / `Site Footer.dc.html` / `js/site-data.js` but never deleted. Also removed two one-off print-export snapshot files that weren't part of the live site. Nothing else currently references dead code.

## 4. Existing features

| Area | Status |
|---|---|
| Home page (hero, featured guide, problem grid, latest guides, shop categories, trust section, email capture) | Built |
| Style guide library with client-side search + tag filters | Built |
| 3 published style guide pages (carousel gallery, outfit breakdowns, shop-the-look, style notes, related guides) | Built |
| Shop storefront with search + category/occasion/price/exact-vs-similar filters | Built |
| Featured Products profile page | Built |
| About / Contact (client-side form validation + honeypot, no backend) | Built |
| Legal pages (privacy, terms, affiliate disclosure) | Built with bracketed placeholders for legal entity info |
| 404 page | Built |
| Responsive layout, skip-link, focus states, reduced-motion support | Built |
| Basic SEO: per-page titles/meta, OG tags, Article/Breadcrumb JSON-LD on guide pages | Built |

## 5. Existing APIs / database

**None.** There is no server, no database, no persisted user data, no auth, no admin CMS. All content is edited by hand in the three `js/*.js` files and redeployed as static files.

## 6. Strengths

- Clean separation of **content** (the `js/*.js` data files) from **presentation** (the `.dc.html` templates) — genuinely useful today: adding a guide or product doesn't require touching markup.
- Consistent, deliberate visual system (cream/black/gold, Oswald display type) applied uniformly across every page.
- Accessibility basics are actually implemented, not just claimed (skip link, aria-current, aria-pressed on filter chips, honeypot + validation on the contact form, reduced-motion).
- Honest handling of unknown data — "Price TBD," "Link coming soon" — rather than fabricated values. This matters a lot for an affiliate business and should be preserved as a hard rule through every future phase.

## 7. Technical debt

- **No shared type/shape contract** for guide and product objects — they're just JS object literals with an English comment for docs. Any future TypeScript or schema validation layer starts from zero.
- **No IDs stable across systems** — `productId` references inside guide outfits are just string matches against `products.js`, with no validation that they resolve. A typo silently breaks a "Shop" link with no error.
- **Guide pages are hand-duplicated files**, not generated from a template + router. Each new guide (`guide-nb9060.dc.html`, `guide-barrel-pants-nb530.dc.html`) is a full copy-paste of `guide-on-cloud-x4.dc.html` with a changed `GUIDE_ID` constant. This works at 3 guides; it will not scale past ~15–20 without becoming an editing hazard (a fix applied to one guide page has to be manually re-applied to every other copy).
- **No real search** — "search" on `guides.dc.html` / `shop.dc.html` / `products.dc.html` is a client-side substring filter over an array that's fully downloaded on page load. Fine at current catalog size; will not scale to a real product catalog (hundreds–thousands of SKUs).
- **No content update workflow** — editing `js/products.js` by hand is the only way to change a price or add an affiliate link. No admin UI, no validation, no audit trail.
- **No analytics** — zero visibility into which guides/products convert.
- **No image pipeline** — images are hand-placed PNGs; no responsive `srcset`, no compression pipeline, no CDN.
- **No tests** of any kind (unit, integration, visual).

## 8. Missing functionality (relative to the long-term vision)

Everything described in the roadmap below as "Missing" — Product Intelligence, Brand/Merchant Intelligence, a real Affiliate Engine, Outfit Builder, AI Stylist, Closet, Wishlist, Admin CMS, Analytics Dashboard, and real search — is **not implemented in any form**. The current site is the front-of-house presentation layer only.

## 9. Scalability concerns

The single biggest structural risk is **guide pages as copy-pasted files**. Everything else (search, storefront filters, product data) can be evolved incrementally without a rewrite, because it already reads from data files rather than hardcoded markup. Guide pages are the one place where content and template are still fused. This should be the first architectural fix — see `ARCHITECTURE.md`, Recommendation 1.
