import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGuideManifest, validateManifestShape, findFabricationViolations } from '../guide-manifest-schema.mjs';
import { buildExistingGuideContext } from '../guide-factory.mjs';
import {
  FIXTURE_PRODUCT_IDS,
  FIXTURE_EXISTING_GUIDES,
  COMPLETE_APPROVED_MANIFEST,
  MISSING_PRODUCT_FACT_MANIFEST,
  DUPLICATE_HERO_MANIFEST,
  STALE_SOURCE_MANIFEST,
  FABRICATED_PRICE_MANIFEST,
  NOW,
} from '../__fixtures__/guide-jobs.mjs';

// validateGuideManifest expects `existingGuides` already projected into
// { id, heroProductId, ... } shape — scripts/guide-factory.mjs's
// buildExistingGuideContext() is what derives that from real
// js/guides.js-shaped records (see that module for why heroProductId
// isn't a literal field on those records). Project the fixture the same
// way a real caller would.
const PROJECTED_EXISTING_GUIDES = buildExistingGuideContext(FIXTURE_EXISTING_GUIDES);

function validate(manifest) {
  return validateGuideManifest(manifest, {
    existingProductIds: FIXTURE_PRODUCT_IDS,
    existingGuides: PROJECTED_EXISTING_GUIDES,
    now: NOW,
  });
}

test('complete approved manifest is valid end-to-end', () => {
  const result = validate(COMPLETE_APPROVED_MANIFEST);
  assert.equal(result.valid, true, JSON.stringify(result.reasons));
});

test('missing product fact is rejected', () => {
  const result = validate(MISSING_PRODUCT_FACT_MANIFEST);
  assert.equal(result.valid, false);
  assert.equal(result.unresolvedProducts.length, 1);
  assert.equal(result.unresolvedProducts[0].productId, 'fx-nonexistent-item');
});

test('duplicate hero product within cooldown window is rejected', () => {
  const result = validate(DUPLICATE_HERO_MANIFEST);
  assert.equal(result.valid, false);
  assert.equal(result.heroCooldown.violated, true);
  assert.equal(result.heroCooldown.conflicts[0].id, 'fx-existing-guide');
});

test('stale source is rejected', () => {
  const result = validate(STALE_SOURCE_MANIFEST);
  assert.equal(result.valid, false);
  assert.ok(result.staleSources.length >= 1);
});

test('fabricated price (set without confirmed status) is rejected', () => {
  const result = validate(FABRICATED_PRICE_MANIFEST);
  assert.equal(result.valid, false);
  assert.ok(result.fabricationViolations.some((v) => v.includes('fabricated fact')));
});

test('findFabricationViolations: confirmed price without a source is rejected', () => {
  const violations = findFabricationViolations({
    newProducts: [{ id: 'p1', priceStatus: 'confirmed', price: 50 }],
  });
  assert.ok(violations.some((v) => v.includes('priceSourceUrl')));
});

test('findFabricationViolations: confirmed price with a source is accepted', () => {
  const violations = findFabricationViolations({
    newProducts: [{ id: 'p1', priceStatus: 'confirmed', price: 50, priceSourceUrl: 'https://example.com' }],
  });
  assert.equal(violations.length, 0);
});

test('findFabricationViolations: affiliate link without a source is rejected', () => {
  const violations = findFabricationViolations({
    newProducts: [{ id: 'p1', priceStatus: 'tbd', affiliateUrl: 'https://example.com/buy' }],
  });
  assert.ok(violations.some((v) => v.includes('affiliateSourceUrl')));
});

test('validateManifestShape: rejects a guide job declared risk-low (guides are never low risk)', () => {
  const result = validateManifestShape({ ...COMPLETE_APPROVED_MANIFEST, riskTier: 'low' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('riskTier')));
});

test('validateManifestShape: missing required field is reported', () => {
  const manifest = { ...COMPLETE_APPROVED_MANIFEST };
  delete manifest.hook;
  const result = validateManifestShape(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('hook')));
});
