# WearWyzer — Engineering Audit (Independent Verification Pass)

Date: 2026-07-11
Scope: full repository inspection, tech stack identification, feature inventory, dead-code/security/scalability review, and a live local run of every page. No files were deleted, renamed, refactored, or rewritten as part of this audit.

## 0. Relationship to the existing root-level docs

Before this audit began, the repository already contained a full documentation set at the root (`ENGINEERING_AUDIT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT.md`, `CONTRIBUTING.md`, `CHANGELOG.md`), all dated 2026-07-11 and committed as part of the single "Initial commit." That set is well-written and largely accurate — its abstract technical-debt claims (no schema validation, no stable cross-file IDs, hand-duplicated guide pages) all held up under direct code inspection.

**Where it's wrong:** it claims all 3 style guides are "Built" / "Published." This audit found that guide #3 (`guide-barrel-pants-nb530.dc.html`) ships with zero controller logic and renders completely blank — verified both statically (`grep -c "data-dc-script"` → `0`) and live (headless Chromium run, runtime console warnings, screenshot). This is the one place the prior audit's claims and the actual code diverge, and it's the most important single finding here. Everything else in this pass either confirms, sharpens, or adds to what the existing docs already say — see `docs/CURRENT_STATE.md`, `docs/FEATURE_INVENTORY.md`, and `docs/TECHNICAL_DEBT.md` for full detail. This document is the synthesis.

## 1. Methodology

1. Full directory inspection (`find`, `git show --stat` on the single commit) — every file accounted for.
2. Read every `.dc.html` page, `support.js`, `image-slot.js`, and all three `js/*.js` data files in full.
3. Wrote and ran a Node script cross-referencing every `productId` in `js/guides.js` against `js/products.js` `id` values, and every `featuredInGuides` entry against `js/guides.js` `id` values — to catch dangling/incorrect references a manual read would miss.
4. Verified file-level claims from the existing docs directly (`ls`/`md5` to confirm claimed dead-file deletions, size/duplicate checks on images and `uploads/`).
5. **Ran the site.** Started a local static server, installed Playwright/Chromium, and loaded all 13 distinct `.dc.html` pages headlessly, capturing console errors/warnings and screenshotting the one page that failed.

## 2. Summary of what WearWyzer is today

A static, front-end-only affiliate content site (2 fully working style guides, a shop storefront, a product profile index, about/contact/legal pages) built on a proprietary browser-side template runtime (`support.js`) that loads React, ReactDOM, and Babel from a CDN at runtime and has no build step, no backend, and no tests. Full detail in `docs/CURRENT_STATE.md`.

## 3. Findings, ranked by severity

| # | Finding | Severity | Detail |
|---|---|---|---|
| 1 | Guide #3 page (`guide-barrel-pants-nb530.dc.html`) has no controller logic — renders completely blank | **Critical** | `docs/FEATURE_INVENTORY.md` §Critical |
| 2 | 3 `productId` references in `js/guides.js` resolve to the wrong product (bracelet→sunglasses, cap→bag, watch→sunglasses) | High | `docs/FEATURE_INVENTORY.md` §Data-integrity |
| 3 | `shop.dc.html` / `products.dc.html` hardcode every "view the guide" link to guide #1 regardless of the product's actual guide | High | `docs/FEATURE_INVENTORY.md` §Cross-page linking |
| 4 | `dc-runtime` source not in repo; `support.js` is an unrebuildable generated artifact | Medium | `docs/TECHNICAL_DEBT.md` §1 |
| 5 | Every page load depends on unpkg.com at runtime, unpinned, no SRI | Medium | `docs/TECHNICAL_DEBT.md` §2 |
| 6 | `uploads/` — 84 MB, entirely unreferenced, 21 of 49 files are exact duplicates of committed assets | Medium | `docs/TECHNICAL_DEBT.md` §3 |
| 7 | `image-slot.js` (686 lines) is dead code | Low-Medium | `docs/FEATURE_INVENTORY.md` §Dead code |
| 8 | Duplicate cover/slide-01 images (~5 MB, compounding per guide) | Low | `docs/TECHNICAL_DEBT.md` §4 |
| 9 | `sitemap.xml` missing 2 of 3 guide pages; dead "Jackets" filter chip; transient console 404 on guide pages | Low | `docs/FEATURE_INVENTORY.md` §Minor |
| 10 | No `.gitignore` anywhere in the repo | Low | `docs/TECHNICAL_DEBT.md` §5 |

No secrets, credentials, or XSS-shaped injection risks were found (see `docs/TECHNICAL_DEBT.md`, closing section).

## 4. Recommended next five engineering actions, in priority order

### 1. Fix guide #3 (add its data object, wire its controller)
- **Current state:** `guide-barrel-pants-nb530.dc.html` exists as pure template markup with zero controller logic; `js/guides.js` has no corresponding entry.
- **Problem:** the page is live-linkable (footer/nav don't link to it directly, but it's a real committed file that could be shared or crawled) and renders completely blank if reached — broken content in front of real users, and a guide that 9 already-written products point at with no visible destination.
- **Proposed action:** add the `barrel-pants-nb530` guide object to `js/guides.js` (content already implied by the page's copy and by the 9 products' `featuredInGuides` entries), then give the page the same `GUIDE_ID` + `import('./js/guides.js')` controller pattern used by the other two working guide pages.
- **Risk:** Low. This is additive — copying an established, working pattern into a file that currently does nothing.
- **Expected benefit:** a real, currently-missing product goes live; removes the single largest gap between what the site claims to ship and what it actually renders.
- **Priority: Critical — do this first, before any other work.**

### 2. Correct the 3 mismatched `productId` references and de-hardcode `guideHref`
- **Current state:** 3 outfit items in the NB 9060 guide link to the wrong product; every product card on Shop/Products pages links to guide #1 regardless of its real guide.
- **Problem:** users clicking "Shop ↓" or "View the Style Guide" land on the wrong product or wrong guide — a direct trust/credibility hit for an affiliate business whose stated differentiator is "the outfit decides, never commission."
- **Proposed action:** fix the 3 `productId` typos in `js/guides.js` (or add the missing bracelet/cap/watch products if those are meant to be distinct SKUs); compute `guideHref` in `shop.dc.html`/`products.dc.html` from each product's actual `featuredInGuides[0]` resolved against `js/guides.js`, instead of a hardcoded string.
- **Risk:** Low. Small, isolated data/logic changes with no architectural impact.
- **Expected benefit:** closes a class of silent-breakage bug the existing audit already flagged as a risk in the abstract — this makes the fix concrete and verifiable.
- **Priority: High — pairs naturally with #1 since both touch `js/guides.js`.**

### 3. Clear `uploads/` and confirm `image-slot.js` is safe to remove
- **Current state:** 84 MB of unreferenced images (`uploads/`) and 686 lines of unused widget code (`image-slot.js`) are sitting in the repo and in git history.
- **Problem:** repo bloat (clone time, hosting/storage cost going forward), and dead code is a standing source of confusion for anyone auditing "what does this site actually load."
- **Proposed action:** confirm with whoever owns the design-tool workflow that none of the 28 non-duplicate `uploads/` files are needed as source material for a future guide, then remove `uploads/` and `image-slot.js` from the working tree (and note the removal in `CHANGELOG.md`, per this project's existing documentation convention). Add a `.gitignore` at the same time so this doesn't silently reaccumulate.
- **Risk:** Low-Medium. Deleting files is inherently less reversible than the other items on this list — confirm nothing is needed before removing, and do it as its own reviewable change, not bundled into a content fix.
- **Expected benefit:** meaningfully smaller repo; removes a whole category of "wait, what is this file for" friction for future engineering work.
- **Priority: Medium — do after #1/#2 land, since it's cleanup rather than a user-facing fix.**

### 4. Self-host (or at minimum pin/SRI) the runtime's CDN dependencies
- **Current state:** React, ReactDOM, and Babel Standalone load from `unpkg.com` on every page load, unpinned beyond the URL's version string, with no integrity hash and no offline fallback.
- **Problem:** this is a live supply-chain and availability dependency for a production site — if `unpkg.com` has an outage, or serves something unexpected, every page fails to render or is compromised.
- **Proposed action:** vendor the three UMD/Babel bundles into `assets/vendor/` (or an equivalent) and update `support.js`'s loader to reference the local copies first, falling back to CDN only if desired; add SRI hashes if the CDN path is kept as a fallback.
- **Risk:** Low. This is a substitution, not a redesign — the loading mechanism in `support.js` already isolates this behavior to `loadReactUmd()`/the Babel loader.
- **Expected benefit:** removes a real availability/integrity risk before the site is under real production traffic, and shaves the CDN round-trip off every cold page load.
- **Priority: Medium — should land before public launch, not urgent before then.**

### 5. Begin Milestone 2 from `ARCHITECTURE.md` (guide template + router), now informed by finding #1
- **Current state:** each guide is a fully hand-duplicated `.dc.html` file; `ARCHITECTURE.md` already recommends collapsing this to one data-driven template, and this audit's #1 finding is a direct, concrete demonstration of why that recommendation is correct — hand-duplication is exactly how guide #3 shipped with no logic at all.
- **Problem:** every new guide currently requires a manual file copy + manual constant edit + manual sitemap update, all steps this audit found had already gone wrong once (guide #3's `data-dc-script` was simply never added).
- **Proposed action:** implement `ARCHITECTURE.md` Recommendation 1 (single `guide-template.dc.html` reading `?guide=<id>`), sequenced exactly as `ROADMAP.md` Milestone 2 already specifies. No change to that plan is needed — this audit just adds first-hand evidence for why it's worth doing next rather than later.
- **Risk:** Low-Medium, as already assessed in `ARCHITECTURE.md` ("Migration effort: Low–Medium").
- **Expected benefit:** structurally prevents the exact failure mode found in this audit from recurring for guide #4 onward.
- **Priority: High, sequenced after #1/#2 (fix what's broken with the current pattern before replacing the pattern itself).**

## 5. What was explicitly not done in this pass
Per instruction, no file was deleted, renamed, refactored, or rewritten — including the pre-existing root-level docs, which are left untouched. This pass only added the four `docs/*.md` files listed above and produced the proposed `CLAUDE.md` for review (not yet committed — see the accompanying message).
