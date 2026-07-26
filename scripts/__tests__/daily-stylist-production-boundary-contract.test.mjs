import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION,
  RESOLUTION_STEPS,
  planDailyStylistProductionRequest,
  serializeDailyStylistProductionPlan,
} from '../daily-stylist-production-boundary-contract.mjs';

function baseRequest(overrides = {}) {
  return {
    requestId: 'req-fixture-01',
    requestedAtIso: '2026-07-26T12:00:00.000Z',
    profileReference: 'fixture-profile-01',
    wardrobeSnapshotReference: 'fixture-wardrobe-snapshot-01',
    occasion: 'everyday',
    seasonClass: 'transitional',
    weatherClass: 'dry',
    dressCode: 'smart-casual',
    availabilityWindow: 'today',
    desiredCount: 2,
    ...overrides,
  };
}

test('a closed, minimized request produces a versioned resolution plan', () => {
  const planned = planDailyStylistProductionRequest(baseRequest());
  assert.equal(planned.ok, true);
  assert.equal(planned.result.schemaVersion, DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION);
  assert.equal(planned.result.requestId, 'req-fixture-01');
  assert.equal(planned.result.profileReference, 'fixture-profile-01');
  assert.equal(planned.result.wardrobeSnapshotReference, 'fixture-wardrobe-snapshot-01');
  assert.deepEqual(planned.result.context, {
    occasion: 'everyday',
    seasonClass: 'transitional',
    weatherClass: 'dry',
    dressCode: 'smart-casual',
    availabilityWindow: 'today',
  });
  assert.equal(planned.result.delegatesTo.dailyOutfitIntentVersion, 'daily-outfit-intent-v1');
  assert.equal(
    planned.result.delegatesTo.groundedDailyOutfitStylistVersion,
    'grounded-daily-outfit-stylist-v1',
  );
  assert.equal(planned.result.policy.realRecordResolutionAllowed, false);
  assert.equal(planned.result.policy.planExecutionAllowed, false);
});

test('two and three desired-outfit counts are both accepted', () => {
  for (const desiredCount of [2, 3]) {
    const planned = planDailyStylistProductionRequest(baseRequest({ desiredCount }));
    assert.equal(planned.ok, true);
    assert.equal(planned.result.desiredCount, desiredCount);
  }
});

test('a desired count outside two or three fails closed', () => {
  for (const desiredCount of [1, 4, 0, '2', null]) {
    const planned = planDailyStylistProductionRequest(baseRequest({ desiredCount }));
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'closed-minimized-request-envelope-required');
  }
});

test('the resolution plan is byte-stable across repeated calls', () => {
  const first = serializeDailyStylistProductionPlan(planDailyStylistProductionRequest(baseRequest()).result);
  const second = serializeDailyStylistProductionPlan(planDailyStylistProductionRequest(baseRequest()).result);
  assert.equal(first, second);
});

test('the required server-side resolution order is fixed, ordered, and exposes a stop reason for every step', () => {
  assert.deepEqual(
    RESOLUTION_STEPS.map((entry) => entry.step),
    [
      'authenticate-session',
      'authorize-same-account-ownership',
      'verify-active-personalization-consent',
      'resolve-profile-reference',
      'verify-wardrobe-snapshot-current',
      'derive-minimized-outfit-candidates',
      'delegate-daily-outfit-intent',
      'adapt-grounded-stylist-response',
    ],
  );
  for (const entry of RESOLUTION_STEPS) {
    assert.equal(typeof entry.failReasonCode, 'string');
    assert.ok(entry.failReasonCode.length > 0);
  }
  const planned = planDailyStylistProductionRequest(baseRequest());
  assert.deepEqual(planned.result.resolutionPlan, RESOLUTION_STEPS);
});

test('revoked/missing consent, cross-account access, unresolved references, stale snapshots, and insufficient candidates each have an explicit documented stop reason', () => {
  const reasonByStep = Object.fromEntries(RESOLUTION_STEPS.map((entry) => [entry.step, entry.failReasonCode]));
  assert.equal(reasonByStep['verify-active-personalization-consent'], 'personalization-consent-revoked-or-missing');
  assert.equal(reasonByStep['authorize-same-account-ownership'], 'cross-account-access-denied');
  assert.equal(reasonByStep['resolve-profile-reference'], 'profile-reference-unresolved');
  assert.equal(reasonByStep['verify-wardrobe-snapshot-current'], 'wardrobe-snapshot-stale-or-unresolved');
  assert.equal(reasonByStep['derive-minimized-outfit-candidates'], 'insufficient-minimized-candidates');
});

test('unknown fields fail closed', () => {
  const planned = planDailyStylistProductionRequest(baseRequest({ extraField: 'unexpected' }));
  assert.equal(planned.ok, false);
  assert.equal(planned.error, 'closed-minimized-request-envelope-required');
});

test('embedded raw profile, wardrobe, Style DNA, Fit DNA, sizes, measurements, photos, and notes payloads fail closed', () => {
  const privateFields = [
    { profile: { name: 'Fixture Person' } },
    { wardrobe: [{ productId: 'fixture-item' }] },
    { styleDna: { palette: ['navy'] } },
    { fitDna: { footwear: 'US 10' } },
    { sizes: { tops: 'M' } },
    { measurements: { chestInches: 40 } },
    { photos: ['data:image/png;base64,'] },
    { notes: 'free text about the user' },
  ];
  for (const override of privateFields) {
    const planned = planDailyStylistProductionRequest(baseRequest(override));
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'closed-minimized-request-envelope-required');
  }
});

test('live/exact location, weather-provider payloads, calendar, itinerary, and browsing history fail closed', () => {
  const liveContextFields = [
    { exactLocation: { lat: 40.7, lng: -74.0 } },
    { weatherProviderPayload: { tempF: 61, provider: 'acme-weather' } },
    { calendar: [{ title: 'Dinner', startIso: '2026-07-26T23:00:00.000Z' }] },
    { itinerary: 'flight then dinner then hotel' },
    { browsingHistory: ['https://example.com/product/1'] },
  ];
  for (const override of liveContextFields) {
    const planned = planDailyStylistProductionRequest(baseRequest(override));
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'closed-minimized-request-envelope-required');
  }
});

test('client-asserted authorization, consent, snapshot freshness, ownership, ranking, and recommendation outcomes fail closed', () => {
  const assertionFields = [
    { authorized: true },
    { consentVerified: true },
    { wardrobeSnapshotFresh: true },
    { ownerAccountId: 'fixture-account-01' },
    { ranking: [{ outfitId: 'fixture-outfit-1', score: 0.9 }] },
    { recommendation: { outfitId: 'fixture-outfit-1' } },
  ];
  for (const override of assertionFields) {
    const planned = planDailyStylistProductionRequest(baseRequest(override));
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'closed-minimized-request-envelope-required');
  }
});

test('credentials, commerce, and external-action fields fail closed', () => {
  const forbiddenFields = [
    { credentials: { apiKey: 'secret' } },
    { price: 42.5 },
    { affiliateOffer: { retailer: 'acme', commissionRate: 0.1 } },
    { purchase: { execute: true } },
    { notify: { channel: 'push' } },
    { publish: { platform: 'instagram' } },
  ];
  for (const override of forbiddenFields) {
    const planned = planDailyStylistProductionRequest(baseRequest(override));
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'closed-minimized-request-envelope-required');
  }
});

test('an unsupported occasion, season, weather, dress code, or availability value fails closed', () => {
  for (const override of [
    { occasion: 'holiday' },
    { seasonClass: 'monsoon' },
    { weatherClass: 'snowy' },
    { dressCode: 'black-tie' },
    { availabilityWindow: 'next-month' },
  ]) {
    const planned = planDailyStylistProductionRequest(baseRequest(override));
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'closed-minimized-request-envelope-required');
  }
});

test('a missing request ID, timestamp, profile reference, or wardrobe snapshot reference fails closed', () => {
  for (const override of [
    { requestId: '' },
    { requestedAtIso: 'not-a-timestamp' },
    { profileReference: '' },
    { wardrobeSnapshotReference: '' },
  ]) {
    const planned = planDailyStylistProductionRequest(baseRequest(override));
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'closed-minimized-request-envelope-required');
  }
});
