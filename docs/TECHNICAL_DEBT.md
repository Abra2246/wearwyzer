# WearWyzer — Technical Debt

This catalogs systemic risk — architecture, dependency, scalability, and repo-hygiene issues — distinct from the concrete functional bugs already itemized in `docs/FEATURE_INVENTORY.md`. Items already well-covered by the pre-existing `ENGINEERING_AUDIT.md` (guide pages as copy-pasted files, no real search, no content workflow, no analytics, no image pipeline, no tests) are referenced rather than repeated; this document adds what that pass did not surface.

## New findings from this audit

### 1. The runtime (`support.js`) is a vendored build artifact with no source in this repo
`support.js` is explicitly generated (`// GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with \`cd dc-runtime && bun run build\`.`), but the `dc-runtime` TypeScript source it's built from does not exist anywhere in this repository. Any bug found in the runtime itself (not the page logic) can currently only be fixed by hand-patching the generated JS directly, against its own explicit instruction not to. There is no path in this repo to regenerate it correctly.
- **Risk:** Medium. The runtime works today, but it's an unowned black box — a runtime-level bug (e.g. in `dc-import`, `sc-for`, or the streaming/hydration logic) has no clean fix path.

### 2. Every page load depends on three third-party CDN scripts at runtime, unpinned by any lockfile or SRI hash
`support.js` dynamically fetches React 18.3.1, ReactDOM 18.3.1, and Babel Standalone 7.29.0 from `unpkg.com` on every fresh page load (`support.js:1594-1618`, `:1048`). There's no `<link rel="integrity">`/SRI hash, no self-hosted fallback, and no offline mode.
- **Risk:** Medium. If `unpkg.com` is unreachable or serves a compromised/altered bundle, the entire site fails to render or is compromised — this is a live supply-chain dependency for a production site, not just a dev convenience.
- Separately, transpiling every page's controller with Babel Standalone in the browser on every load is a real, avoidable performance cost with zero caching benefit across sessions (no service worker, no precompiled build).

### 3. `uploads/` — 84 MB of unreferenced binary files in the git history
49 UUID-named PNGs under `uploads/`, confirmed unreferenced by any `.dc.html` or `.js` file. 21 of 49 are exact-content duplicates (verified by MD5) of files that already live under `assets/images/`; the remainder look like raw/uncropped drops from the design tool's own image-upload workflow (see `image-slot.js`) that were never cleaned up before commit.
- **Risk:** Low functionally, but this is now permanently in git history (single initial commit or not, every future clone pays for it) and will only grow if the same workflow keeps depositing raw uploads without cleanup. It also has no `.gitignore` guarding against it happening again.
- **Related:** `image-slot.js` (686 lines) is itself dead code — the widget that would have produced these uploads isn't wired into any live page.

### 4. Duplicate cover images (verified, minor)
Each guide's `<id>-cover.png` is a byte-identical copy of that guide's `slide-01.png` (confirmed via `md5`) — e.g. `on-cloud-x4-cover.png` and `on-cloud-x4/slide-01.png` are the same 1.28 MB file stored twice. This is consistent across all three guides (~5 MB of pure duplication today, growing linearly with every future guide at this same rate). Likely an artifact of "cover = first slide" being implemented as a full copy rather than a reference.
- **Risk:** Low. Not a bug, just avoidable storage/bandwidth waste that compounds per guide.

### 5. No repo-level `.gitignore`
There is no `.gitignore` anywhere in the repository. Nothing sensitive has leaked as a result of this today, but it means nothing currently stops a future `node_modules/`, `.env`, editor config, or OS file (`.DS_Store`) from being committed by accident once any tooling (even just a local dev server) is introduced.

### 6. Guide #3 shipped without its data — a symptom of "no schema, no validation" being more than theoretical
`ENGINEERING_AUDIT.md` §7 already flags "no shared type/shape contract" and "no IDs stable across systems" as abstract risks. This audit found the concrete failure mode those risks predicted: guide #3's entire content object was never added to `js/guides.js`, its page shipped with zero controller logic, and nothing caught it — no schema validation, no build step, no smoke test, nothing — before it reached `CHANGELOG.md` as "Added." Whatever content workflow eventually replaces hand-edited JS files (`ARCHITECTURE.md` Recommendation 2) needs to close this specific gap, not just the general one: at minimum, a guide page shouldn't be publishable/linkable until its data object exists and its own controller can find it.

### 7. Filename-with-space componentization pattern
`Site Nav.dc.html` and `Site Footer.dc.html` (both containing a literal space) are fetched at runtime by `<dc-import name="Site Nav">`. This resolves correctly in local static serving (confirmed live), but has not been verified against every static host's URL-encoding behavior for filenames with spaces (some object-storage-backed static hosts are stricter about this than a plain file server). Worth a smoke test against the actual chosen host before launch, or renaming to avoid the class of risk entirely (e.g. `site-nav.dc.html`).

## Carried forward from the pre-existing `ENGINEERING_AUDIT.md` (still accurate, not re-litigated here)
- Guide pages are hand-duplicated files rather than a template + router (`ARCHITECTURE.md` Recommendation 1).
- No real search — client-side substring filter over a fully-downloaded array.
- No content update workflow beyond hand-editing `js/*.js`.
- No analytics, no image pipeline (responsive `srcset`, compression, CDN), no tests of any kind.
- `affiliateUrl` is a single string field per product — no multi-retailer support, no click tracking (`ARCHITECTURE.md` Recommendation 4).

## What this audit did NOT find (worth stating explicitly)
- No secrets, API keys, or credentials anywhere in the repo.
- No XSS-shaped injection risk observed in the reviewed templates — all dynamic content flows through the `{{ }}` interpolation system rather than raw `innerHTML` concatenation, and user input (the contact form, email capture) is never reflected back into the DOM unescaped.
- No evidence of the previously-claimed dead-file cleanup (`Home.dc.html`, `SiteHeader.dc.html`, `SiteFooter.dc.html`, `js/data.js`) being incomplete — all four are confirmed absent from the working tree, matching `CHANGELOG.md`'s claim.
