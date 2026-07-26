import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRAND_MEMORY_VERSION,
  BRAND_ROLES,
  buildBrandPreferenceFitMemory,
  serializeBrandPreferenceFitMemory,
} from '../brand-preference-fit-memory.mjs';

function base(overrides = {}) {
  return {
    profileVersion: 1,
    explicitRoles: [
      { brandId: 'adidas', role: 'favorite', source: 'explicit-user' },
      { brandId: 'avoid-me', role: 'avoided', source: 'explicit-user' },
    ],
    inferredSignals: [
      {
        brandId: 'Dickies',
        signal: 'most-worn-likelihood',
        confidence: 0.88,
        evidenceCode: 'wardrobe-frequency',
      },
    ],
    corrections: [],
    fitMemory: [
      {
        itemId: 'owned-adidas-shoe',
        brandId: 'adidas',
        category: 'footwear',
        size: 'US 10',
        outcome: 'as-preferred',
        source: 'explicit-user',
      },
    ],
    ...overrides,
  };
}

test('version and closed role vocabulary are explicit', () => {
  assert.equal(BRAND_MEMORY_VERSION, 'brand-preference-fit-memory-v1');
  assert.deepEqual(BRAND_ROLES, [
    'favorite',
    'avoided',
    'best-fitting',
    'most-worn',
    'aspirational',
  ]);
});

test('explicit and inferred roles remain distinguishable', () => {
  const result = buildBrandPreferenceFitMemory(base()).result;
  const adidas = result.brands.find(({ brandId }) => brandId === 'adidas');
  const dickies = result.brands.find(({ brandId }) => brandId === 'Dickies');
  assert.equal(adidas.roles[0].source, 'explicit-user');
  assert.equal(adidas.roles[0].confidence, 1);
  assert.equal(dickies.roles[0].source, 'inferred');
  assert.equal(dickies.roles[0].confidence, 0.88);
  assert.equal(dickies.recommendationInfluence, 'tie-break-only');
});

test('explicit correction outranks inference and may remove avoidance', () => {
  const result = buildBrandPreferenceFitMemory(base({
    inferredSignals: [{
      brandId: 'avoid-me',
      signal: 'favorite-likelihood',
      confidence: 0.95,
      evidenceCode: 'saved-style-selection',
    }],
    corrections: [
      {
        correctionId: 'correction-1',
        version: 1,
        brandId: 'avoid-me',
        role: 'avoided',
        action: 'remove',
      },
      {
        correctionId: 'correction-2',
        version: 1,
        brandId: 'avoid-me',
        role: 'favorite',
        action: 'add',
      },
    ],
  })).result;
  const corrected = result.brands.find(({ brandId }) => brandId === 'avoid-me');
  assert.equal(corrected.status, 'eligible');
  assert.deepEqual(corrected.roles.map(({ role, source }) => ({ role, source })), [{
    role: 'favorite',
    source: 'explicit-correction',
  }]);
});

test('a later correction reverses an earlier correction deterministically', () => {
  const result = buildBrandPreferenceFitMemory(base({
    explicitRoles: [],
    inferredSignals: [],
    corrections: [
      {
        correctionId: 'correction-add',
        version: 1,
        brandId: 'brand-a',
        role: 'favorite',
        action: 'add',
      },
      {
        correctionId: 'correction-remove',
        version: 2,
        brandId: 'brand-a',
        role: 'favorite',
        action: 'remove',
      },
    ],
    fitMemory: [],
  })).result;
  assert.deepEqual(result.brands, []);
});

test('contradictory avoided and positive roles require review', () => {
  const result = buildBrandPreferenceFitMemory(base({
    explicitRoles: [
      { brandId: 'conflict-brand', role: 'avoided', source: 'explicit-user' },
      { brandId: 'conflict-brand', role: 'best-fitting', source: 'explicit-user' },
    ],
    inferredSignals: [],
    fitMemory: [],
  })).result;
  assert.equal(result.status, 'review-required');
  assert.equal(result.brands[0].status, 'review-required');
  assert.equal(result.brands[0].recommendationInfluence, 'none');
  assert.deepEqual(result.conflicts, [{
    brandId: 'conflict-brand',
    code: 'avoided-brand-has-positive-role',
    roles: ['avoided', 'best-fitting'],
  }]);
});

test('avoided brands remain excluded and cannot influence recommendations', () => {
  const result = buildBrandPreferenceFitMemory(base()).result;
  const avoided = result.brands.find(({ brandId }) => brandId === 'avoid-me');
  assert.equal(avoided.status, 'excluded');
  assert.equal(avoided.recommendationInfluence, 'none');
});

test('fit memory exposes stable owned references and coarse outcomes only', () => {
  const result = buildBrandPreferenceFitMemory(base()).result;
  const adidas = result.brands.find(({ brandId }) => brandId === 'adidas');
  assert.deepEqual(adidas.fitMemory, [{
    itemId: 'owned-adidas-shoe',
    category: 'footwear',
    size: 'US 10',
    outcome: 'as-preferred',
    source: 'explicit-user',
  }]);
});

test('low-confidence inferred signals never become brand roles', () => {
  const result = buildBrandPreferenceFitMemory(base({
    explicitRoles: [],
    inferredSignals: [{
      brandId: 'weak-signal',
      signal: 'favorite-likelihood',
      confidence: 0.4,
      evidenceCode: 'saved-style-selection',
    }],
    fitMemory: [],
  })).result;
  assert.deepEqual(result.brands, []);
});

test('recommendation policy prevents preference from overriding quality or fit', () => {
  const policy = buildBrandPreferenceFitMemory(base()).result.policy;
  assert.equal(policy.preferenceMayOverrideQualityOrFit, false);
  assert.equal(policy.preferenceUse, 'tie-break-only-after-equal-quality-and-fit');
  assert.equal(policy.commercialInfluenceAllowed, false);
  assert.deepEqual(policy.precedence, [
    'styling-quality',
    'wearwyzer-usefulness',
    'editorial-credibility',
    'verified-fit',
    'brand-preference',
  ]);
});

test('invalid, private, commercial, duplicate, and non-increasing evidence fails closed', () => {
  const invalidCases = [
    base({ browsingHistory: [] }),
    base({ inferredSignals: [{ brandId: 'x', signal: 'favorite-likelihood', confidence: 1, evidenceCode: 'purchase-history' }] }),
    base({ explicitRoles: [{ brandId: 'x', role: 'favorite', source: 'paid-placement' }] }),
    base({ inferredSignals: [
      { brandId: 'x', signal: 'favorite-likelihood', confidence: 0.8, evidenceCode: 'saved-style-selection' },
      { brandId: 'x', signal: 'favorite-likelihood', confidence: 0.9, evidenceCode: 'fit-feedback' },
    ] }),
    base({ corrections: [
      { correctionId: 'same', version: 1, brandId: 'x', role: 'favorite', action: 'add' },
      { correctionId: 'same', version: 2, brandId: 'x', role: 'favorite', action: 'remove' },
    ] }),
    base({ corrections: [
      { correctionId: 'one', version: 1, brandId: 'x', role: 'favorite', action: 'add' },
      { correctionId: 'two', version: 1, brandId: 'x', role: 'favorite', action: 'remove' },
    ] }),
  ];
  for (const input of invalidCases) {
    assert.equal(buildBrandPreferenceFitMemory(input).ok, false);
  }
});

test('minimized output excludes private behavior, commerce, and account data', () => {
  const serialized = JSON.stringify(buildBrandPreferenceFitMemory(base()).result);
  assert.doesNotMatch(
    serialized,
    /browsing|wearLedger|purchaseHistory|returnHistory|privateNote|accountId|affiliate|commission|retailer|price|popularity/i,
  );
});

test('identical evidence serializes byte-stably', () => {
  const result = buildBrandPreferenceFitMemory(base()).result;
  assert.equal(
    serializeBrandPreferenceFitMemory(result),
    serializeBrandPreferenceFitMemory(structuredClone(result)),
  );
});
