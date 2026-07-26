import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOutfitCompatibility } from '../outfit-compatibility-contract.mjs';
import {
  OUTFIT_SET_RECOMMENDATION_VERSION,
  recommendOutfitSet,
  serializeOutfitSetRecommendation,
} from '../outfit-set-recommendation-contract.mjs';

function signal(dimension, value) {
  return {
    dimension,
    value,
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'explicit-user-selection',
  };
}

function item(itemId, role, ownership = 'owned', overrides = {}) {
  return {
    itemId,
    productId: `product-${itemId}`,
    ownership,
    role,
    evidenceState: 'current',
    aesthetics: ['minimal'],
    palette: ['navy'],
    silhouette: 'relaxed',
    formality: 'smart-casual',
    materials: ['cotton'],
    occasions: ['everyday'],
    seasons: ['transitional'],
    layering: role === 'outerwear' ? 'outer-layer' : 'base',
    riskLevel: 'balanced',
    fitStatus: role === 'accessory' ? 'not-applicable' : 'verified',
    ...overrides,
  };
}

function compatibility(outfitId, overrides = {}) {
  const input = {
    outfitId,
    evidenceVersion: 1,
    styleDnaVersion: 'style-dna-v1',
    styleSignals: [
      signal('palette', 'navy'),
      signal('silhouette', 'relaxed'),
      signal('formality', 'smart-casual'),
      signal('material', 'cotton'),
      signal('layering', 'outer-layer'),
    ],
    target: { occasion: 'everyday', season: 'transitional' },
    items: [
      item(`${outfitId}-top`, 'top'),
      item(`${outfitId}-bottom`, 'bottom'),
      item(`${outfitId}-shoe`, 'footwear'),
      item(`${outfitId}-jacket`, 'outerwear'),
    ],
    ...overrides,
  };
  return evaluateOutfitCompatibility(input).result;
}

function formula(seed, overrides = {}) {
  return {
    silhouette: `${seed}-silhouette`,
    palette: `${seed}-palette`,
    layering: `${seed}-layering`,
    formality: `${seed}-formality`,
    occasionExecution: `${seed}-execution`,
    ...overrides,
  };
}

function candidate(id, overrides = {}) {
  return {
    candidateId: id,
    compatibility: compatibility(id),
    formula: formula(id),
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    requestId: 'fixture-set-request',
    evidenceVersion: 1,
    intent: 'everyday',
    desiredCount: 2,
    candidates: [
      candidate('outfit-one'),
      candidate('outfit-two', {
        compatibility: compatibility('outfit-two', {
          items: [
            item('two-top', 'top'),
            item('two-bottom', 'bottom'),
            item('two-shoe', 'footwear', 'prospective'),
            item('two-jacket', 'outerwear'),
          ],
        }),
      }),
      candidate('outfit-three'),
    ],
    ...overrides,
  };
}

test('two distinct trusted outfits form a minimized recommended set', () => {
  const result = recommendOutfitSet(request()).result;
  assert.equal(result.schemaVersion, OUTFIT_SET_RECOMMENDATION_VERSION);
  assert.equal(result.status, 'recommended-set');
  assert.equal(result.selectedOutfitIds.length, 2);
  assert.ok(result.evaluations.every(({ formula, compatibilityRef }) => formula && compatibilityRef));
});

test('owned-first preference operates only inside the same quality band', () => {
  const prospective = compatibility('outfit-prospective', {
    items: [
      item('prospective-top', 'top'),
      item('prospective-bottom', 'bottom'),
      item('prospective-shoe', 'footwear', 'prospective'),
      item('prospective-jacket', 'outerwear'),
    ],
  });
  const result = recommendOutfitSet(request({
    desiredCount: 2,
    candidates: [
      candidate('outfit-one', {
        compatibility: { ...compatibility('outfit-one'), score: 92 },
      }),
      candidate('outfit-three', {
        compatibility: { ...compatibility('outfit-three'), score: 91 },
      }),
      candidate('outfit-prospective', {
        compatibility: { ...prospective, score: 94 },
      }),
    ],
  })).result;
  assert.ok(result.selectedOutfitIds.includes('outfit-one'));
  assert.ok(result.selectedOutfitIds.includes('outfit-three'));
  assert.equal(result.selectedOutfitIds.includes('outfit-prospective'), false);
  assert.ok(result.decisionReasonCodes.includes('owned-first-preference-within-quality-band'));
});

test('duplicate formulas are excluded rather than counted as variety', () => {
  const duplicate = formula('duplicate');
  const result = recommendOutfitSet(request({
    candidates: [
      candidate('outfit-one', { formula: duplicate }),
      candidate('outfit-two', { formula: duplicate }),
      candidate('outfit-three'),
    ],
  })).result;
  assert.equal(result.status, 'insufficient-candidates');
  assert.deepEqual(result.qualifiedOutfitIds, ['outfit-three']);
  assert.ok(result.evaluations
    .filter(({ outfitId }) => outfitId !== 'outfit-three')
    .every(({ reasonCodes }) => reasonCodes.includes('duplicate-outfit-formula')));
});

test('an exact ranking tie crossing the boundary remains reviewable', () => {
  const result = recommendOutfitSet(request({
    desiredCount: 2,
    candidates: [
      candidate('outfit-one'),
      candidate('outfit-two'),
      candidate('outfit-three'),
    ],
  })).result;
  assert.equal(result.status, 'tie-review');
  assert.deepEqual(result.selectedOutfitIds, []);
  assert.deepEqual(result.tiedOutfitIds, ['outfit-one', 'outfit-three', 'outfit-two']);
});

test('incompatible, review-required, and weak candidates do not qualify', () => {
  const blocked = compatibility('blocked', {
    styleSignals: [{
      ...signal('palette', 'navy'),
      sentiment: 'negative',
    }],
  });
  const review = compatibility('review', {
    items: [
      item('review-top', 'top'),
      item('review-bottom', 'bottom'),
      item('review-shoe', 'footwear', 'owned', { fitStatus: 'unknown' }),
      item('review-jacket', 'outerwear'),
    ],
  });
  const weak = compatibility('weak', {
    styleSignals: [signal('palette', 'cream')],
    items: [
      item('weak-top', 'top'),
      item('weak-bottom', 'bottom'),
      item('weak-shoe', 'footwear'),
    ],
  });
  const result = recommendOutfitSet(request({
    candidates: [
      candidate('blocked', { compatibility: blocked }),
      candidate('review', { compatibility: review }),
      candidate('weak', { compatibility: weak }),
    ],
  })).result;
  assert.equal(result.status, 'none-qualified');
  assert.deepEqual(result.qualifiedOutfitIds, []);
});

test('one trustworthy outfit is insufficient instead of inflated into a set', () => {
  const blocked = compatibility('blocked', {
    styleSignals: [{
      ...signal('palette', 'navy'),
      sentiment: 'negative',
    }],
  });
  const result = recommendOutfitSet(request({
    candidates: [
      candidate('outfit-one'),
      candidate('blocked', { compatibility: blocked }),
    ],
  })).result;
  assert.equal(result.status, 'insufficient-candidates');
  assert.deepEqual(result.selectedOutfitIds, []);
  assert.deepEqual(result.qualifiedOutfitIds, ['outfit-one']);
});

test('three requested outfits are supported when three distinct candidates qualify', () => {
  const result = recommendOutfitSet(request({ desiredCount: 3 })).result;
  assert.equal(result.status, 'recommended-set');
  assert.equal(result.selectedOutfitIds.length, 3);
});

test('stale product, unresolved fit, missing item, and wrong intent fail qualification', () => {
  const stale = compatibility('stale', {
    items: [
      item('stale-top', 'top'),
      item('stale-bottom', 'bottom', 'owned', { evidenceState: 'stale' }),
      item('stale-shoe', 'footwear'),
    ],
  });
  const result = recommendOutfitSet(request({
    candidates: [
      candidate('stale', { compatibility: stale }),
      candidate('outfit-one'),
    ],
  })).result;
  const staleEvaluation = result.evaluations.find(({ outfitId }) => outfitId === 'stale');
  assert.equal(staleEvaluation.eligible, false);
  assert.ok(staleEvaluation.reasonCodes.includes('product-evidence-not-current'));
});

test('unknown, private, and commercial fields fail closed', () => {
  const invalid = [
    request({ affiliateCommission: 8 }),
    request({ desiredCount: 4 }),
    request({ intent: 'shopping' }),
    request({ candidates: [candidate('outfit-one')] }),
    request({
      candidates: [
        { ...candidate('outfit-one'), price: 120 },
        candidate('outfit-two'),
      ],
    }),
    request({
      candidates: [
        candidate('outfit-one', {
          compatibility: { ...compatibility('outfit-one'), privateWardrobe: [] },
        }),
        candidate('outfit-two'),
      ],
    }),
  ];
  for (const input of invalid) {
    assert.deepEqual(
      recommendOutfitSet(input),
      { ok: false, error: 'valid-minimized-outfit-set-request-required' },
    );
  }
});

test('duplicate candidate IDs and mismatched evidence versions fail closed', () => {
  const duplicate = candidate('outfit-one');
  assert.equal(recommendOutfitSet(request({ candidates: [duplicate, duplicate] })).ok, false);
  assert.equal(recommendOutfitSet(request({ evidenceVersion: 2 })).ok, false);
});

test('result excludes raw wardrobe, profile, commerce, and external actions', () => {
  const serialized = serializeOutfitSetRecommendation(recommendOutfitSet(request()).result);
  for (const forbidden of [
    'affiliateCommission',
    'retailer',
    'price',
    'privateWardrobe',
    'profile',
    'purchaseHistory',
    'browserHistory',
    'checkout',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  const policy = recommendOutfitSet(request()).result.policy;
  assert.equal(policy.commercialInfluenceAllowed, false);
  assert.equal(policy.externalActionsAllowed, false);
});

test('identical fixture input serializes byte-stably', () => {
  const first = serializeOutfitSetRecommendation(recommendOutfitSet(request()).result);
  const second = serializeOutfitSetRecommendation(recommendOutfitSet(request()).result);
  assert.equal(first, second);
});
