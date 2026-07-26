import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOutfitCompatibility } from '../outfit-compatibility-contract.mjs';
import {
  DAILY_OUTFIT_INTENT_VERSION,
  evaluateDailyOutfitIntent,
  serializeDailyOutfitIntent,
} from '../daily-outfit-intent-contract.mjs';

function signal(dimension, value, overrides = {}) {
  return {
    dimension,
    value,
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'explicit-user-selection',
    ...overrides,
  };
}

function item(seed, role, overrides = {}) {
  return {
    itemId: `${seed}-${role}`,
    productId: `fixture-${seed}-${role}`,
    ownership: 'owned',
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
    fitStatus: 'verified',
    ...overrides,
  };
}

function compatibility(outfitId, overrides = {}) {
  return evaluateOutfitCompatibility({
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
      item(outfitId, 'top'),
      item(outfitId, 'bottom'),
      item(outfitId, 'footwear'),
      item(outfitId, 'outerwear'),
    ],
    ...overrides,
  }).result;
}

function candidate(id) {
  return {
    candidateId: id,
    compatibility: compatibility(id),
    formula: {
      silhouette: `${id}-silhouette`,
      palette: `${id}-palette`,
      layering: `${id}-layering`,
      formality: `${id}-formality`,
      occasionExecution: `${id}-execution`,
    },
  };
}

function request(overrides = {}) {
  return {
    requestId: 'fixture-daily-request',
    evidenceVersion: 1,
    occasion: 'everyday',
    seasonClass: 'transitional',
    weatherClass: 'dry',
    dressCode: 'smart-casual',
    availabilityWindow: 'today',
    desiredCount: 2,
    candidates: [candidate('look-one'), candidate('look-two')],
    ...overrides,
  };
}

test('explicit current context delegates to the accepted outfit-set contract', () => {
  const result = evaluateDailyOutfitIntent(request()).result;
  assert.equal(result.schemaVersion, DAILY_OUTFIT_INTENT_VERSION);
  assert.equal(result.status, 'ready');
  assert.equal(result.outfitSet.status, 'recommended-set');
  assert.equal(result.outfitSet.selectedOutfitIds.length, 2);
});

test('three requested outfits remain supported through the shared set boundary', () => {
  const result = evaluateDailyOutfitIntent(request({
    desiredCount: 3,
    candidates: [candidate('look-one'), candidate('look-two'), candidate('look-three')],
  })).result;
  assert.equal(result.status, 'ready');
  assert.equal(result.outfitSet.desiredCount, 3);
});

test('unknown weather and season require review without invented context', () => {
  for (const [field, value, reason] of [
    ['weatherClass', 'unknown', 'weather-class-unknown'],
    ['seasonClass', 'unknown', 'season-class-unknown'],
  ]) {
    const result = evaluateDailyOutfitIntent(request({ [field]: value })).result;
    assert.equal(result.status, 'review-required');
    assert.equal(result.outfitSet, null);
    assert.ok(result.reasonCodes.includes(reason));
  }
});

test('ambiguous dress code and unavailable timing require review', () => {
  const ambiguous = evaluateDailyOutfitIntent(request({ dressCode: 'ambiguous' })).result;
  assert.equal(ambiguous.status, 'review-required');
  assert.ok(ambiguous.reasonCodes.includes('dress-code-ambiguous'));
  for (const availabilityWindow of ['unknown', 'stale']) {
    const result = evaluateDailyOutfitIntent(request({ availabilityWindow })).result;
    assert.equal(result.status, 'review-required');
    assert.equal(result.outfitSet, null);
  }
});

test('conflicting weather and season abstain rather than guessing', () => {
  const result = evaluateDailyOutfitIntent(request({
    seasonClass: 'warm',
    weatherClass: 'cold',
  })).result;
  assert.equal(result.status, 'abstained');
  assert.ok(result.reasonCodes.includes('warm-season-conflicts-with-cold-weather'));
});

test('dress code conflicting with occasion abstains', () => {
  const result = evaluateDailyOutfitIntent(request({ dressCode: 'formal' })).result;
  assert.equal(result.status, 'abstained');
  assert.ok(result.reasonCodes.includes('formal-dress-code-conflicts-with-occasion'));
});

test('outfit-set tie remains review-required at the intent boundary', () => {
  const result = evaluateDailyOutfitIntent(request({
    candidates: [candidate('look-one'), candidate('look-two'), candidate('look-three')],
  })).result;
  assert.equal(result.status, 'review-required');
  assert.equal(result.outfitSet.status, 'tie-review');
});

test('insufficient trusted candidates produce abstention', () => {
  const blocked = compatibility('blocked', {
    styleSignals: [signal('palette', 'navy', { sentiment: 'negative' })],
  });
  const result = evaluateDailyOutfitIntent(request({
    candidates: [
      candidate('look-one'),
      { ...candidate('blocked'), compatibility: blocked },
    ],
  })).result;
  assert.equal(result.status, 'abstained');
  assert.equal(result.outfitSet.status, 'insufficient-candidates');
});

test('invalid candidate evidence fails closed through the shared contract', () => {
  const bad = candidate('look-one');
  bad.compatibility = { ...bad.compatibility, price: 100 };
  assert.deepEqual(
    evaluateDailyOutfitIntent(request({ candidates: [bad, candidate('look-two')] })),
    { ok: false, error: 'valid-minimized-outfit-candidates-required' },
  );
});

test('unknown, private, live-context, and commercial fields fail closed', () => {
  for (const invalid of [
    request({ latitude: 41.8 }),
    request({ calendarEvent: 'Private meeting' }),
    request({ affiliateCommission: 8 }),
    request({ desiredCount: 4 }),
    request({ weatherClass: 'live-api' }),
  ]) {
    assert.deepEqual(
      evaluateDailyOutfitIntent(invalid),
      { ok: false, error: 'valid-minimized-daily-outfit-intent-required' },
    );
  }
});

test('minimized output excludes location, calendar, profile, commerce, and actions', () => {
  const serialized = serializeDailyOutfitIntent(evaluateDailyOutfitIntent(request()).result);
  for (const forbidden of [
    'latitude',
    'longitude',
    'calendar',
    'address',
    'itinerary',
    'profile',
    'wardrobe',
    'price',
    'retailer',
    'affiliate',
    'commission',
    'checkout',
  ]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false);
  const policy = evaluateDailyOutfitIntent(request()).result.policy;
  assert.equal(policy.liveContextAccessAllowed, false);
  assert.equal(policy.commercialInfluenceAllowed, false);
  assert.equal(policy.externalActionsAllowed, false);
});

test('identical fixture input serializes byte-stably', () => {
  const first = serializeDailyOutfitIntent(evaluateDailyOutfitIntent(request()).result);
  const second = serializeDailyOutfitIntent(evaluateDailyOutfitIntent(request()).result);
  assert.equal(first, second);
});
