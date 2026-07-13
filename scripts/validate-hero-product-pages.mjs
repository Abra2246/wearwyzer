#!/usr/bin/env node
// Validates the dedicated hero-product pages (js/hero-pages.js registry,
// e.g. product-nb-9060-breakfast-tea.dc.html) against the Knowledge Graph
// under data/*.js. No dependencies, no build step — plain Node ESM, same
// style as the repo's other scripts/validate-*.mjs scripts.
//
// Usage:
//   node scripts/validate-hero-product-pages.mjs
//
// Exit code 0 = no structural errors (warnings may still be printed).
// Exit code 1 = at least one structural error was found.
//
// Structural checks (cause a non-zero exit):
//   - every js/hero-pages.js productId resolves to a real data/products.js
//     product
//   - every js/hero-pages.js page file exists on disk
//   - every page file's PRODUCT_ID controller constant matches the
//     registry's productId for that file (catches copy/paste drift when a
//     page is duplicated to cover a new product)
//   - recommendation-eligibility regression test: every relationship with
//     verificationStatus !== 'verified', or confidence below "editorial",
//     is correctly excluded by data/taxonomies.js isPubliclyRecommendable()
//     — this is the "temporary negative test for recommendation
//     eligibility" the issue requires, run as a permanent regression check
//     against the one known draft/unverified edge in the graph
//     (on-cloud-x4 -> light-jeans ALTERNATIVE_TO) rather than a one-off
//     manual step.
//
// Note: this script is not yet wired into .github/workflows/ — see
// docs/HERO_PRODUCT_V1.md for why (workflow files are outside this change's
// permitted scope). Run it manually alongside the other validators until a
// human with workflow-edit access adds it to CI.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { HERO_PRODUCT_PAGES } = await import(path.join(ROOT, 'js', 'hero-pages.js'));
const { getProductById } = await import(path.join(ROOT, 'data', 'products.js'));
const { relationships } = await import(path.join(ROOT, 'data', 'relationships.js'));
const { isPubliclyRecommendable } = await import(path.join(ROOT, 'data', 'taxonomies.js'));

const errors = [];
const warnings = [];

// ---- 1. registry entries resolve -----------------------------------------

for (const [productId, file] of Object.entries(HERO_PRODUCT_PAGES)) {
  if (!getProductById(productId)) {
    errors.push(`js/hero-pages.js: productId "${productId}" does not resolve to a data/products.js product`);
    continue;
  }

  const filePath = path.join(ROOT, file);
  if (!existsSync(filePath)) {
    errors.push(`js/hero-pages.js: page file "${file}" for product "${productId}" does not exist on disk`);
    continue;
  }

  const source = readFileSync(filePath, 'utf8');
  const match = source.match(/const PRODUCT_ID = '([^']+)'/);
  if (!match) {
    errors.push(`"${file}": no "const PRODUCT_ID = '...'" controller constant found`);
  } else if (match[1] !== productId) {
    errors.push(
      `"${file}": PRODUCT_ID constant is "${match[1]}" but js/hero-pages.js registers it under "${productId}" — these must match`
    );
  }
}

// ---- 2. recommendation-eligibility regression test ------------------------

let checkedIneligible = 0;
for (const rel of relationships) {
  const shouldBeEligible = rel.verificationStatus === 'verified' && (rel.confidence === 'editorial' || rel.confidence === 'verified');
  const actuallyEligible = isPubliclyRecommendable(rel);
  if (shouldBeEligible !== actuallyEligible) {
    errors.push(
      `Relationship "${rel.id}" (confidence "${rel.confidence}", verificationStatus "${rel.verificationStatus}") ` +
        `has isPubliclyRecommendable() === ${actuallyEligible}, expected ${shouldBeEligible}`
    );
  }
  if (!shouldBeEligible) checkedIneligible++;
}

// Known fixture from data/relationships.js: on-cloud-x4 -> light-jeans is
// the one draft/unverified edge in the current graph. If a future content
// edit resolves it to verified/editorial, this check simply finds zero
// ineligible edges and warns instead of failing — it does not assume the
// fixture will always exist.
const knownDraftEdge = relationships.find(
  (r) => r.predicate === 'ALTERNATIVE_TO' && r.subjectId === 'on-cloud-x4' && r.objectId === 'light-jeans'
);
if (knownDraftEdge) {
  if (isPubliclyRecommendable(knownDraftEdge)) {
    errors.push(
      `Known draft edge "${knownDraftEdge.id}" (verificationStatus "${knownDraftEdge.verificationStatus}") ` +
        'is incorrectly eligible for public recommendation'
    );
  }
} else {
  warnings.push(
    'Expected fixture relationship ALTERNATIVE_TO:product:on-cloud-x4:product:light-jeans not found — ' +
      'the recommendation-eligibility regression test ran against 0 known-ineligible fixtures this time'
  );
}

if (checkedIneligible === 0) {
  warnings.push('No draft/stale/rejected/low-confidence relationships exist in the graph right now — the eligibility gate is unexercised by real data');
}

// ---- report ----------------------------------------------------------------

console.log(
  `Checked ${Object.keys(HERO_PRODUCT_PAGES).length} hero product page(s) and ${relationships.length} relationships ` +
    'for recommendation-eligibility correctness.\n'
);

if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log('  - ' + w));
  console.log('');
}

if (errors.length) {
  console.log(`✗ ${errors.length} structural error(s):`);
  errors.forEach((e) => console.log('  - ' + e));
  console.log('\nFAILED — fix the structural errors above.');
  process.exit(1);
} else {
  console.log('✓ No structural errors.');
  process.exit(0);
}
