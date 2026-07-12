# CLAUDE.md — WearWyzer

Repository-specific rules for any AI agent (or engineer) working in this codebase. This file is scoped to *how to work here*; product direction lives in `ROADMAP.md`, architecture decisions in `ARCHITECTURE.md`, and content rules in `DEVELOPMENT.md`. Read those before this one contradicts anything — it shouldn't, but they're the source of truth on scope/sequencing, not this file.

## What this project is
A static, front-end-only prototype (no backend, no database, no build step, no package manager). Every `.dc.html` page is a self-contained template + controller compiled client-side by `support.js`, a **generated, vendored runtime** — its own header says "do not edit, rebuild with `dc-runtime`," but that source isn't in this repo. Treat `support.js` and `image-slot.js` as read-only unless a task specifically asks you to touch the runtime itself, and flag it to the user before doing so.

## Before touching content data (`js/guides.js`, `js/products.js`, `js/site-data.js`)
- Every `productId` referenced in a guide's `outfits[].items[]` must resolve to a real `id` in `js/products.js` — **and to the correct one**. Run `node scripts/validate-content-data.mjs` after any edit to `js/guides.js` or `js/products.js` — it checks every cross-reference (`productId`, `relatedProducts`, `featuredInGuides`, guide slugs) and warns on label/product mismatches and asymmetric product-guide relationships. Exit code `1` means a structural error exists and must be fixed before committing; read every warning even on a clean exit. This is how the "Minimal Watch" mismatch and the missing Guide #3 controller were both caught — don't rely on eyeballing the data alone.
- If you add a new guide page (`guide-*.dc.html`), it is not done until: (1) its object exists in `js/guides.js`, (2) its page has a `data-dc-script` controller following the `GUIDE_ID` + `import('./js/guides.js')` pattern used by `guide-on-cloud-x4.dc.html`/`guide-nb9060.dc.html`, and (3) `sitemap.xml` has an entry for it. `guide-barrel-pants-nb530.dc.html` shipped without step 2 and rendered completely blank — verify by actually loading the page (see "Verifying a change" below), not just by writing the files.
- Never fabricate a price, affiliate link, availability claim, or legal entity detail. Use the existing honest-placeholder patterns (`price: null` → "Price TBD", `affiliateUrl: ""` → "Link coming soon", `[BRACKETED]` in legal pages). This is a hard rule, not a style preference — it's core to the affiliate business's credibility.

## Before touching pages (`*.dc.html`)
- Styling is inline only (`style="..."`, plus the runtime's `style-hover=`/`style-focus=` attributes) — no CSS files, no utility classes, no new colors/fonts outside the existing palette (cream `#F6F1E8` / surface `#FFFDF8` / ink `#0B0B0B` / muted `#68645D` / border `#DDD3C3` / accent `#C8941E`, Oswald display type).
- Shared chrome (`Site Nav.dc.html`, `Site Footer.dc.html`) is composed via `<dc-import>` — extend those files rather than re-implementing nav/footer markup on a page.
- A page's `guideHref`/similar cross-page links must be computed from the actual data (e.g. a product's `featuredInGuides`), not hardcoded to a specific guide. `shop.dc.html` and `products.dc.html` currently hardcode every product's "view the guide" link to guide #1 — don't copy that pattern into new code; fixing the existing instances is tracked in `docs/ENGINEERING_AUDIT.md`.

## Verifying a change (do this before calling anything done)
This repo has no tests and no CI. The only way to know a page actually works is to load it:
```
python3 -m http.server 8000   # from the repo root
```
then open the changed page(s) in a real browser (or headless via Playwright) and check the browser console — the runtime logs an explicit warning for every unresolved `{{ }} ` binding (`[dc-runtime] <page>: {{ field }} never resolved — rendered as empty`), which is exactly how this audit caught the broken guide #3 page. A page with no console warnings and visible content in the areas you changed is the bar for "done," not just "the files exist."

## Scope discipline
- Check `ROADMAP.md` before starting anything — is this milestone next in sequence, or does it depend on one that hasn't landed (e.g. don't build Closet/Wishlist or the AI Stylist ahead of the database milestones)?
- Check `ARCHITECTURE.md` for an existing recommendation covering the area you're touching before proposing a different approach.
- Prefer the smallest change that solves the real problem. Known, intentionally-deferred debt is catalogued in `docs/TECHNICAL_DEBT.md` and `ENGINEERING_AUDIT.md` §7 — don't "fix" it as a side effect of an unrelated task.

## Documentation
- Every significant architectural decision goes in `ARCHITECTURE.md` (current state / problem / proposed solution / benefit / migration effort / priority) **before** implementation.
- Every shipped change gets a `CHANGELOG.md` entry — and the entry should reflect what was actually verified working, not just what was written (see the guide #3 lesson above).
- Don't delete, rename, or bulk-refactor files speculatively. If something looks like dead code or bloat (e.g. `uploads/`, `image-slot.js` — see `docs/TECHNICAL_DEBT.md`), flag it and confirm before removing rather than removing it as a drive-by.
