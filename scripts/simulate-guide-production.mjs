#!/usr/bin/env node
// Guide production writer end-to-end simulation (issue #46 acceptance
// criterion: "re-running the writer is idempotent" + "one approved
// manifest produces one live, customer-facing hero guide without manually
// editing multiple content files"). Runs entirely against the isolated
// fixture universe in scripts/__fixtures__/guide-jobs.mjs and an
// in-memory copy of the current js/guides.js / js/products.js /
// sitemap.xml shape plus an isolated temporary asset tree — never real site content — so this is safe to
// run any time without touching a single real file.
//
// Usage:
//   node scripts/simulate-guide-production.mjs
//
// Exit code 0 = the fixture manifest reached ready-for-pr, the writer
// applied every change exactly once, and a second run was a full no-op.
// Exit code 1 = any of that didn't hold (a regression in the pipeline).

import { runGuideFactoryJob } from './guide-factory.mjs';
import { planGuideProduction, recordExists } from './guide-production-writer.mjs';
import { planGuideAssetWrites, writeGuideAssetPlan } from './guide-production-assets.mjs';
import { scanStaticSite } from './qa-static-site.mjs';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FIXTURE_PRODUCT_IDS, FIXTURE_EXISTING_GUIDES, COMPLETE_APPROVED_MANIFEST, NOW } from './__fixtures__/guide-jobs.mjs';

const FIXTURE_GUIDES_SOURCE = `export const guides = [
  { id: "fx-existing-guide" },
];
`;

const FIXTURE_PRODUCTS_SOURCE = `export const products = [
  { id: "fx-hero-jacket-b", featuredInGuides: [] },
  { id: "fx-tee", featuredInGuides: ["fx-existing-guide"] },
  { id: "fx-jeans", featuredInGuides: [] },
  { id: "fx-cap", featuredInGuides: [] },
  { id: "fx-boots", featuredInGuides: ["fx-existing-guide"] },
];

export const CATEGORIES = ["Jackets"];
`;

const FIXTURE_SITEMAP_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.wearwyzer.com/</loc><priority>1.0</priority></url>
</urlset>
`;

const result = runGuideFactoryJob(COMPLETE_APPROVED_MANIFEST, {
  existingProductIds: FIXTURE_PRODUCT_IDS,
  existingGuides: FIXTURE_EXISTING_GUIDES,
  now: NOW,
});

if (result.outcome !== 'ready-for-pr') {
  console.error('✗ Simulation FAILED — the known-good fixture manifest did not reach ready-for-pr.');
  console.error(result.reasons.join('\n'));
  process.exit(1);
}

const firstRun = planGuideProduction({
  guidesSourceText: FIXTURE_GUIDES_SOURCE,
  productsSourceText: FIXTURE_PRODUCTS_SOURCE,
  sitemapSourceText: FIXTURE_SITEMAP_SOURCE,
  factoryResult: result,
});

const secondRun = planGuideProduction({
  guidesSourceText: firstRun.guidesSourceText,
  productsSourceText: firstRun.productsSourceText,
  sitemapSourceText: firstRun.sitemapSourceText,
  factoryResult: result,
});

const assetRoot = mkdtempSync(path.join(tmpdir(), 'wearwyzer-production-simulation-'));
const assetPlan = planGuideAssetWrites(result);
const firstAssetRun = writeGuideAssetPlan(assetRoot, assetPlan);
const firstAssetBytes = new Map(
  firstAssetRun.allPaths.map((relativePath) => [relativePath, readFileSync(path.join(assetRoot, relativePath), 'utf8')])
);
const secondAssetRun = writeGuideAssetPlan(assetRoot, assetPlan);
const assetBytesUnchanged = secondAssetRun.allPaths.every(
  (relativePath) => readFileSync(path.join(assetRoot, relativePath), 'utf8') === firstAssetBytes.get(relativePath)
);
const assetReferences = [...result.guideRecord.slideImages.map((image) => image.src), result.guideRecord.coverImage]
  .map((src) => `<img src="${src}" alt="fixture">`)
  .join('\n');
writeFileSync(path.join(assetRoot, result.guideRecord.slug), `<!doctype html><html><body>${assetReferences}</body></html>`, 'utf8');
const staticQa = scanStaticSite(assetRoot);

const evidence = {
  jobId: COMPLETE_APPROVED_MANIFEST.jobId,
  outcome: result.outcome,
  firstRun: { anyApplied: firstRun.anyApplied, changes: firstRun.changes },
  secondRun: { anyApplied: secondRun.anyApplied, alreadyFullyApplied: secondRun.alreadyFullyApplied },
  guideWrittenOnce: (firstRun.guidesSourceText.match(new RegExp(`id: "${result.guideRecord.id}"`, 'g')) || []).length === 1,
  sitemapEntryWrittenOnce: (firstRun.sitemapSourceText.match(new RegExp(result.guideRecord.slug.replace('.dc.html', '.html'), 'g')) || []).length === 1,
  assets: {
    expected: COMPLETE_APPROVED_MANIFEST.slides.length + 1,
    firstRunWritten: firstAssetRun.written.length,
    secondRunWritten: secondAssetRun.written.length,
    secondRunSkipped: secondAssetRun.skipped.length,
    byteIdentical: assetBytesUnchanged,
    staticQaPassed: staticQa.passed,
  },
};

console.log(JSON.stringify(evidence, null, 2));

const ok =
  firstRun.anyApplied === true &&
  secondRun.anyApplied === false &&
  secondRun.alreadyFullyApplied === true &&
  secondRun.guidesSourceText === firstRun.guidesSourceText &&
  recordExists(firstRun.guidesSourceText, result.guideRecord.id) &&
  evidence.guideWrittenOnce &&
  evidence.sitemapEntryWrittenOnce &&
  firstAssetRun.written.length === COMPLETE_APPROVED_MANIFEST.slides.length + 1 &&
  secondAssetRun.written.length === 0 &&
  secondAssetRun.skipped.length === firstAssetRun.allPaths.length &&
  assetBytesUnchanged &&
  staticQa.passed;

if (!ok) {
  console.error('\n✗ Simulation FAILED — production writer did not apply-once-and-then-no-op as expected.');
  process.exit(1);
}

console.log('\n✓ Fixture guide job ran end-to-end from manifest to written content and persisted assets; static QA passed and a repeat run was a byte-identical no-op.');
