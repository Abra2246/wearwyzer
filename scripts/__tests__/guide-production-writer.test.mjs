import test from 'node:test';
import assert from 'node:assert/strict';
import { runGuideFactoryJob } from '../guide-factory.mjs';
import {
  serializeRecord,
  recordExists,
  insertBeforeArrayClose,
  addGuideToFeaturedInGuides,
  upsertSitemapUrl,
  planGuideProduction,
} from '../guide-production-writer.mjs';
import {
  FIXTURE_PRODUCT_IDS,
  FIXTURE_EXISTING_GUIDES,
  COMPLETE_APPROVED_MANIFEST,
  MISSING_PRODUCT_FACT_MANIFEST,
  MISSING_ASSET_MANIFEST,
  FABRICATED_PRICE_MANIFEST,
  NOW,
} from '../__fixtures__/guide-jobs.mjs';

const FIXTURE_GUIDES_SOURCE = `export const guides = [
  { id: "fx-existing-guide" },
];
`;

const FIXTURE_PRODUCTS_SOURCE = `export const products = [
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

function runJob(manifest, overrides = {}) {
  return runGuideFactoryJob(manifest, {
    existingProductIds: FIXTURE_PRODUCT_IDS,
    existingGuides: FIXTURE_EXISTING_GUIDES,
    now: NOW,
    ...overrides,
  });
}

function plan(factoryResult) {
  return planGuideProduction({
    guidesSourceText: FIXTURE_GUIDES_SOURCE,
    productsSourceText: FIXTURE_PRODUCTS_SOURCE,
    sitemapSourceText: FIXTURE_SITEMAP_SOURCE,
    factoryResult,
  });
}

// -- serializeRecord / insertBeforeArrayClose --------------------------------

test('serializeRecord renders unquoted identifier keys and double-quoted string values', () => {
  const text = serializeRecord({ id: 'x', count: 2, tags: ['a', 'b'], nested: { a: 1 } });
  assert.match(text, /^ {2}\{/);
  assert.match(text, /id: "x"/);
  assert.match(text, /count: 2/);
  assert.match(text, /tags: \["a", "b"\]/);
});

test('insertBeforeArrayClose inserts before the top-level array close, not a nested one', () => {
  const result = insertBeforeArrayClose(FIXTURE_PRODUCTS_SOURCE, 'products', '  { id: "new-one" }');
  assert.ok(recordExists(result, 'new-one'));
  assert.ok(result.includes('export const CATEGORIES = ["Jackets"];'), 'CATEGORIES array must be untouched');
  // still valid: only one new entry was added to `products`, not `CATEGORIES`
  assert.equal(result.match(/id: "new-one"/g).length, 1);
});

test('recordExists is false for an id that only appears as a substring of another id', () => {
  assert.equal(recordExists(FIXTURE_PRODUCTS_SOURCE, 'fx-tee-extra'), false);
  assert.equal(recordExists(FIXTURE_PRODUCTS_SOURCE, 'fx-tee'), true);
});

// -- addGuideToFeaturedInGuides ------------------------------------------------

test('addGuideToFeaturedInGuides appends to an existing (non-empty) list', () => {
  const { text, changed } = addGuideToFeaturedInGuides(FIXTURE_PRODUCTS_SOURCE, 'fx-tee', 'fx-new-guide');
  assert.equal(changed, true);
  assert.match(text, /featuredInGuides: \["fx-existing-guide", "fx-new-guide"\]/);
});

test('addGuideToFeaturedInGuides fills an empty list correctly', () => {
  const { text, changed } = addGuideToFeaturedInGuides(FIXTURE_PRODUCTS_SOURCE, 'fx-jeans', 'fx-new-guide');
  assert.equal(changed, true);
  assert.match(text, /"fx-jeans", featuredInGuides: \["fx-new-guide"\]/);
});

test('addGuideToFeaturedInGuides is idempotent — a second call is a no-op', () => {
  const first = addGuideToFeaturedInGuides(FIXTURE_PRODUCTS_SOURCE, 'fx-tee', 'fx-new-guide');
  const second = addGuideToFeaturedInGuides(first.text, 'fx-tee', 'fx-new-guide');
  assert.equal(second.changed, false);
  assert.equal(second.text, first.text);
});

// -- upsertSitemapUrl -----------------------------------------------------------

test('upsertSitemapUrl inserts a new entry before </urlset>', () => {
  const { text, changed } = upsertSitemapUrl(FIXTURE_SITEMAP_SOURCE, { loc: 'https://www.wearwyzer.com/guide-x.html', priority: '0.9' });
  assert.equal(changed, true);
  assert.match(text, /<loc>https:\/\/www\.wearwyzer\.com\/guide-x\.html<\/loc>/);
  assert.ok(text.indexOf('guide-x.html') < text.indexOf('</urlset>'));
});

test('upsertSitemapUrl is idempotent for an already-present loc', () => {
  const first = upsertSitemapUrl(FIXTURE_SITEMAP_SOURCE, { loc: 'https://www.wearwyzer.com/guide-x.html' });
  const second = upsertSitemapUrl(first.text, { loc: 'https://www.wearwyzer.com/guide-x.html' });
  assert.equal(second.changed, false);
  assert.equal(second.text, first.text);
});

// -- planGuideProduction: successful production --------------------------------

test('planGuideProduction writes the guide, patches existing products, and upserts the sitemap', () => {
  const result = runJob(COMPLETE_APPROVED_MANIFEST);
  assert.equal(result.outcome, 'ready-for-pr');
  const p = plan(result);

  assert.equal(p.anyApplied, true);
  assert.equal(p.alreadyFullyApplied, false);
  assert.ok(recordExists(p.guidesSourceText, 'fx-new-guide'));
  assert.match(p.productsSourceText, /"fx-tee", featuredInGuides: \["fx-existing-guide", "fx-new-guide"\]/);
  assert.match(p.productsSourceText, /"fx-jeans", featuredInGuides: \["fx-new-guide"\]/);
  assert.match(p.productsSourceText, /"fx-cap", featuredInGuides: \["fx-new-guide"\]/);
  assert.ok(p.sitemapSourceText.includes('fx-hero-jacket-b.html'));
  assert.match(p.pageHtml, /<!DOCTYPE html>/);
  assert.equal(p.pagePath, 'guide-fx-hero-jacket-b.dc.html');

  const guideChange = p.changes.find((c) => c.type === 'guide');
  assert.equal(guideChange.applied, true);
});

test('planGuideProduction only requires ready-for-pr — a needs-human result is rejected up front', () => {
  const result = runJob(MISSING_PRODUCT_FACT_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.throws(() => plan(result), /outcome must be "ready-for-pr"/);
});

test('a blocked/needs-human factory result (missing rendered asset) never reaches the writer', () => {
  const result = runJob(MISSING_ASSET_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.ok(result.renderedAssets.every((a) => a.status === 'blocked'));
  assert.throws(() => plan(result));
});

test('a fabricated-price manifest is rejected before any content is ever produced to write', () => {
  const result = runJob(FABRICATED_PRICE_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.stage, 'manifest-validation');
  assert.throws(() => plan(result));
});

// -- idempotent re-run ------------------------------------------------------------

test('re-running planGuideProduction against its own output is a full no-op', () => {
  const result = runJob(COMPLETE_APPROVED_MANIFEST);
  const first = plan(result);
  const second = planGuideProduction({
    guidesSourceText: first.guidesSourceText,
    productsSourceText: first.productsSourceText,
    sitemapSourceText: first.sitemapSourceText,
    factoryResult: result,
  });
  assert.equal(second.anyApplied, false);
  assert.equal(second.alreadyFullyApplied, true);
  assert.equal(second.guidesSourceText, first.guidesSourceText);
  assert.equal(second.productsSourceText, first.productsSourceText);
  assert.equal(second.sitemapSourceText, first.sitemapSourceText);
  // no duplicate guide record
  assert.equal((second.guidesSourceText.match(/id: "fx-new-guide"/g) || []).length, 1);
});

// -- affiliate coverage reporting stays intact through the writer ------------------

test('the factory result plumbed into the writer still carries its (non-blocking) affiliate coverage report', () => {
  const result = runJob(COMPLETE_APPROVED_MANIFEST);
  assert.equal(result.outcome, 'ready-for-pr');
  assert.ok(result.policyResult.affiliateCoverage);
  assert.equal(typeof result.policyResult.affiliateCoverage.coverageRatio, 'number');
  // the fixture manifest declares no newProducts, so there is nothing to
  // report a link for — 0 total is the honest, non-fabricated state.
  assert.equal(result.policyResult.affiliateCoverage.total, 0);
});
