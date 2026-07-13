import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runGuideFactoryJob,
  selectNextApprovedJob,
  deriveHeroProductId,
  buildExistingGuideContext,
  computeRelatedProductIds,
} from '../guide-factory.mjs';
import {
  FIXTURE_PRODUCT_IDS,
  FIXTURE_EXISTING_GUIDES,
  COMPLETE_APPROVED_MANIFEST,
  MISSING_PRODUCT_FACT_MANIFEST,
  DUPLICATE_HERO_MANIFEST,
  STALE_SOURCE_MANIFEST,
  MISSING_ASSET_MANIFEST,
  TOO_FEW_OUTFITS_MANIFEST,
  NOW,
} from '../__fixtures__/guide-jobs.mjs';

function runJob(manifest, overrides = {}) {
  return runGuideFactoryJob(manifest, {
    existingProductIds: FIXTURE_PRODUCT_IDS,
    existingGuides: FIXTURE_EXISTING_GUIDES,
    now: NOW,
    ...overrides,
  });
}

// -- complete guide job success -------------------------------------------

test('complete guide job runs end to end to ready-for-pr with no human prompt relay', () => {
  const result = runJob(COMPLETE_APPROVED_MANIFEST);
  assert.equal(result.outcome, 'ready-for-pr', JSON.stringify(result.reasons));
  assert.equal(result.haltsForReview, true);
  assert.equal(result.guideRecord.id, 'fx-new-guide');
  assert.ok(result.guideRecord.relatedProducts.includes('fx-hero-jacket-b'));
  assert.equal(result.slideSpecs.length, COMPLETE_APPROVED_MANIFEST.slides.length);
  assert.ok(result.renderedAssets.every((a) => a.status === 'rendered'));
  assert.match(result.pageHtml, /<!DOCTYPE html>/);
  assert.match(result.pageHtml, new RegExp(COMPLETE_APPROVED_MANIFEST.website.title));
  assert.equal(result.metadata.sitemapEntry.loc.endsWith('.html'), true);
  assert.equal(result.policyResult.passed, true);
});

// -- missing product fact --------------------------------------------------

test('missing product fact stops at manifest validation with no guessing', () => {
  const result = runJob(MISSING_PRODUCT_FACT_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.stage, 'manifest-validation');
  assert.ok(result.reasons.some((r) => r.includes('fx-nonexistent-item')));
});

// -- duplicate hero/concept rejection ---------------------------------------

test('duplicate hero product within cooldown stops at manifest validation', () => {
  const result = runJob(DUPLICATE_HERO_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.stage, 'manifest-validation');
  assert.ok(result.reasons.some((r) => r.includes('cooldown window')));
});

// -- stale source rejection --------------------------------------------------

test('stale source stops at manifest validation', () => {
  const result = runJob(STALE_SOURCE_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.stage, 'manifest-validation');
  assert.ok(result.reasons.some((r) => r.includes('stale')));
});

// -- missing asset (no external renderer configured) -------------------------

test('missing asset (external renderer requested but unconfigured) marks rendering blocked and stops for a human, without discarding the slide specs', () => {
  const result = runJob(MISSING_ASSET_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.stage, 'content-quality-policy');
  assert.equal(result.slideSpecs.length, MISSING_ASSET_MANIFEST.slides.length);
  assert.ok(result.renderedAssets.every((a) => a.status === 'blocked'));
  assert.ok(result.reasons.some((r) => r.includes('no rendered asset')));
});

// -- failed validator ---------------------------------------------------------

test('failed content quality validator (too few outfits) stops for a human', () => {
  const result = runJob(TOO_FEW_OUTFITS_MANIFEST);
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.stage, 'content-quality-policy');
  assert.ok(result.reasons.some((r) => r.includes('minimum is')));
});

// -- supporting pipeline functions -------------------------------------------

test('deriveHeroProductId finds the productId common to every outfit', () => {
  assert.equal(deriveHeroProductId(FIXTURE_EXISTING_GUIDES[0]), 'fx-hero-jacket');
});

test('deriveHeroProductId returns null when no single product is common to every outfit', () => {
  const guide = { outfits: [{ items: [{ productId: 'a' }] }, { items: [{ productId: 'b' }] }] };
  assert.equal(deriveHeroProductId(guide), null);
});

test('buildExistingGuideContext projects real guide shape into the dedup-check shape', () => {
  const context = buildExistingGuideContext(FIXTURE_EXISTING_GUIDES);
  assert.equal(context[0].heroProductId, 'fx-hero-jacket');
  assert.equal(context[0].publishedDate, '2026-06-20');
});

test('computeRelatedProductIds is unique and hero-first', () => {
  const ids = computeRelatedProductIds(COMPLETE_APPROVED_MANIFEST);
  assert.equal(ids[0], 'fx-hero-jacket-b');
  assert.equal(new Set(ids).size, ids.length);
});

// -- single-flight job selection ----------------------------------------------

test('selectNextApprovedJob refuses to select while another job is in-progress', () => {
  const jobs = [{ jobId: 'a', status: 'in-progress', createdAt: NOW }, { jobId: 'b', status: 'approved', createdAt: NOW }];
  const { selected, reason } = selectNextApprovedJob(jobs);
  assert.equal(selected, null);
  assert.match(reason, /already in-progress/);
});

test('selectNextApprovedJob picks the oldest approved job', () => {
  const jobs = [
    { jobId: 'newer', status: 'approved', createdAt: '2026-07-05T00:00:00.000Z' },
    { jobId: 'older', status: 'approved', createdAt: '2026-07-01T00:00:00.000Z' },
  ];
  const { selected } = selectNextApprovedJob(jobs);
  assert.equal(selected.jobId, 'older');
});

test('selectNextApprovedJob returns null when nothing is approved', () => {
  const { selected, reason } = selectNextApprovedJob([{ jobId: 'a', status: 'draft', createdAt: NOW }]);
  assert.equal(selected, null);
  assert.match(reason, /no approved job/);
});
