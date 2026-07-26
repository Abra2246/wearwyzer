import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_EVIDENCE_MAX_AGE_DAYS,
  FIT_INTELLIGENCE_VERSION,
  recommendFixtureFit,
  serializeFitGuidance,
} from '../fit-intelligence-contract.mjs';

const NOW = '2026-07-26T00:00:00.000Z';
const profile = Object.freeze({
  profileVersion: 1,
  category: 'top',
  targetFit: 'relaxed',
  usualSize: Object.freeze({ system: 'alpha', value: 'M' }),
  knownBrandFits: Object.freeze([]),
});
const evidence = Object.freeze({
  evidenceVersion: 1,
  productId: 'fixture-overshirt',
  brandId: 'fixture-brand',
  category: 'top',
  state: 'current',
  verifiedAtIso: '2026-07-20T00:00:00.000Z',
  sizeSystem: 'alpha',
  availableSizes: Object.freeze(['S', 'M', 'L', 'XL']),
  fitTendency: 'runs-small',
  regionalConversions: Object.freeze({
    M: Object.freeze({ US: 'M', EU: '48' }),
    L: Object.freeze({ US: 'L', EU: '50' }),
  }),
});

function fit(overrides = {}) {
  return {
    itemId: 'owned-fixture-overshirt',
    brandId: 'fixture-brand',
    category: 'top',
    sizeSystem: 'alpha',
    size: 'M',
    outcome: 'as-preferred',
    source: 'explicit-correction',
    ...overrides,
  };
}

test('version and freshness threshold are explicit', () => {
  assert.equal(FIT_INTELLIGENCE_VERSION, 'fit-intelligence-v1');
  assert.equal(FIT_EVIDENCE_MAX_AGE_DAYS, 30);
});

test('current fit tendency supports explainable guidance', () => {
  const result = recommendFixtureFit({ profile, productEvidence: evidence, nowIso: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.result.status, 'guidance-available');
  assert.equal(result.result.recommendedSize, 'L');
  assert.equal(result.result.confidence, 'medium');
  assert.equal(result.result.expectedSilhouette, 'relaxed');
  assert.deepEqual(result.result.regionalConversions, { US: 'L', EU: '50' });
  assert.ok(result.result.reasonCodes.includes('verified-runs-small-size-up'));
  assert.ok(result.result.likelyIssues.includes('cross-product-size-transfer'));
});

test('explicit same-brand correction outranks usual size and generic tendency', () => {
  const corrected = {
    ...profile,
    knownBrandFits: [fit()],
  };
  const result = recommendFixtureFit({
    profile: corrected,
    productEvidence: evidence,
    nowIso: NOW,
  }).result;
  assert.equal(result.recommendedSize, 'M');
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.ownedItemComparisons, [{
    itemId: 'owned-fixture-overshirt',
    size: 'M',
    outcome: 'as-preferred',
    source: 'explicit-correction',
  }]);
  assert.deepEqual(result.reasonCodes, ['explicit-same-brand-correction-used']);
});

test('unavailable evidence-supported size produces no substitute guess', () => {
  const unavailable = {
    ...evidence,
    availableSizes: ['S', 'M', 'XL'],
    regionalConversions: { M: { US: 'M', EU: '48' } },
  };
  const result = recommendFixtureFit({
    profile,
    productEvidence: unavailable,
    nowIso: NOW,
  }).result;
  assert.equal(result.status, 'recommended-size-unavailable');
  assert.equal(result.recommendedSize, null);
  assert.deepEqual(result.reasonCodes, ['evidence-supported-size-not-currently-available']);
});

test('stale and non-current evidence abstain', () => {
  const stale = recommendFixtureFit({
    profile,
    productEvidence: { ...evidence, verifiedAtIso: '2026-05-01T00:00:00.000Z' },
    nowIso: NOW,
  }).result;
  assert.equal(stale.status, 'stale-evidence');
  assert.equal(stale.recommendedSize, null);
  const ambiguous = recommendFixtureFit({
    profile,
    productEvidence: { ...evidence, state: 'ambiguous' },
    nowIso: NOW,
  }).result;
  assert.equal(ambiguous.status, 'ambiguous-evidence');
  assert.equal(ambiguous.recommendedSize, null);
});

test('conflicting explicit corrections produce no recommendation', () => {
  const conflicting = {
    ...profile,
    knownBrandFits: [
      fit({ itemId: 'owned-one', size: 'M' }),
      fit({ itemId: 'owned-two', size: 'L' }),
    ],
  };
  const result = recommendFixtureFit({
    profile: conflicting,
    productEvidence: evidence,
    nowIso: NOW,
  }).result;
  assert.equal(result.status, 'conflicting-fit-evidence');
  assert.equal(result.recommendedSize, null);
  assert.equal(result.ownedItemComparisons.length, 2);
});

test('unknown or unsupported size evidence remains low-confidence or abstains', () => {
  const unknown = recommendFixtureFit({
    profile,
    productEvidence: { ...evidence, fitTendency: 'unknown' },
    nowIso: NOW,
  }).result;
  assert.equal(unknown.status, 'guidance-available');
  assert.equal(unknown.recommendedSize, 'M');
  assert.equal(unknown.confidence, 'low');
  const unsupported = recommendFixtureFit({
    profile: { ...profile, usualSize: { system: 'alpha', value: 'One Size' } },
    productEvidence: evidence,
    nowIso: NOW,
  }).result;
  assert.equal(unsupported.status, 'insufficient-evidence');
  assert.equal(unsupported.recommendedSize, null);
});

test('invalid schemas and product/profile mismatches fail closed', () => {
  assert.equal(recommendFixtureFit({
    profile: { ...profile, measurements: { chest: 40 } },
    productEvidence: evidence,
    nowIso: NOW,
  }).error, 'valid-minimized-fit-profile-required');
  assert.equal(recommendFixtureFit({
    profile,
    productEvidence: { ...evidence, price: 120 },
    nowIso: NOW,
  }).error, 'valid-verified-size-evidence-required');
  assert.equal(recommendFixtureFit({
    profile: { ...profile, category: 'footwear' },
    productEvidence: evidence,
    nowIso: NOW,
  }).error, 'profile-and-product-size-system-mismatch');
});

test('minimized result excludes sensitive, commerce, and guarantee fields', () => {
  const result = recommendFixtureFit({
    profile: { ...profile, knownBrandFits: [fit()] },
    productEvidence: evidence,
    nowIso: NOW,
  }).result;
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /measurement|weight|height|bodyShape|photo|affiliate|commission|price|retailer|account|fitNote/i,
  );
  assert.doesNotMatch(serialized, /guarantee|perfect fit|will fit/i);
});

test('regional conversions are never invented', () => {
  const result = recommendFixtureFit({
    profile: { ...profile, knownBrandFits: [fit()] },
    productEvidence: { ...evidence, regionalConversions: { L: { US: 'L', EU: '50' } } },
    nowIso: NOW,
  }).result;
  assert.deepEqual(result.regionalConversions, {});
});

test('identical evidence serializes byte-stably', () => {
  const result = recommendFixtureFit({ profile, productEvidence: evidence, nowIso: NOW }).result;
  assert.equal(serializeFitGuidance(result), serializeFitGuidance(structuredClone(result)));
});
