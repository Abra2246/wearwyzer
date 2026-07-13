## Summary


## Linked issue
Closes #

## Source specification
<!-- Which ROADMAP.md milestone / ARCHITECTURE.md recommendation / docs entry does this implement? -->

## Scope
<!-- What this PR touches. Confirm nothing outside the linked issue's scope changed. -->

## Validation
- [ ] Ran `node scripts/validate-content-data.mjs` (required if `js/guides.js` or `js/products.js` changed) — exit code 0, warnings read
- [ ] Ran `node scripts/qa-static-site.mjs` (required if a page, asset, or local link changed) — exit code 0
- [ ] Ran `node scripts/validate-knowledge-graph.mjs` (required if `js/guides.js`, `js/products.js`, or anything under `data/` changed) — exit code 0, warnings read
- [ ] Ran `node scripts/compare-legacy-adapter.mjs` (required if anything under `data/` changed) — report-only, reviewed any diffs against `docs/CURRENT_DATA_TO_GRAPH_MAPPING.md`
- [ ] Ran `./scripts/preview.sh` and loaded every page this PR touches in a real browser
- [ ] Checked the browser console for `[dc-runtime] ... never resolved` warnings — none introduced
- [ ] Ran `node --test scripts/__tests__/` (required if any `scripts/queue-*.mjs` changed) — exit code 0
- [ ] No fabricated price, affiliate link, availability claim, or legal detail was introduced
- [ ] `CHANGELOG.md` updated to describe what was actually verified working, not just what was written
- [ ] `sitemap.xml` updated if a new page was added

## Risk tier
<!-- Low / Medium / High — should match the linked issue's risk tier -->

## Preview
<!-- Link to the GitHub Pages preview build for this branch/PR, once deployed -->
