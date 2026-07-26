import assert from 'node:assert/strict';
import test from 'node:test';
import { createDailyOutfitIntentJourney } from '../daily-outfit-intent-journey.mjs';
import {
  GROUNDED_DAILY_OUTFIT_STYLIST_VERSION,
  adaptDailyOutfitStylistResponse,
  serializeGroundedDailyOutfitStylistResponse,
  validateDailyOutfitIntentResult,
} from '../grounded-daily-outfit-stylist.mjs';

function dailyResult(mode = 'ready-two') {
  const journey = createDailyOutfitIntentJourney();
  journey.selectMode(mode);
  return journey.run().view.result;
}

test('ready two and three outfit decisions become grounded answers', () => {
  for (const [mode, count] of [['ready-two', 2], ['ready-three', 3]]) {
    const adapted = adaptDailyOutfitStylistResponse(dailyResult(mode));
    assert.equal(adapted.ok, true);
    assert.equal(adapted.response.schemaVersion, GROUNDED_DAILY_OUTFIT_STYLIST_VERSION);
    assert.equal(adapted.response.outcome, 'answer');
    assert.equal(adapted.response.selectedOutfitIds.length, count);
    assert.equal(adapted.response.citations.length, 2);
    assert.equal(adapted.response.uncertainty.level, 'low');
  }
});

test('context uncertainty remains a review-required non-answer', () => {
  for (const mode of ['unknown-weather', 'ambiguous-dress-code', 'stale-availability']) {
    const response = adaptDailyOutfitStylistResponse(dailyResult(mode)).response;
    assert.equal(response.outcome, 'review-required');
    assert.deepEqual(response.selectedOutfitIds, []);
    assert.equal(response.outfitEvidence.length, 0);
    assert.equal(response.nextStep, 'confirm-explicit-context');
    assert.equal(response.uncertainty.value, 1);
  }
});

test('context contradictions remain abstentions with exact reasons', () => {
  const expected = {
    'weather-season-conflict': 'warm-season-conflicts-with-cold-weather',
    'dress-code-occasion-conflict': 'formal-dress-code-conflicts-with-occasion',
  };
  for (const [mode, reason] of Object.entries(expected)) {
    const response = adaptDailyOutfitStylistResponse(dailyResult(mode)).response;
    assert.equal(response.outcome, 'abstain');
    assert.ok(response.reasonCodes.includes(reason));
    assert.equal(response.nextStep, 'resolve-context-conflict');
  }
});

test('Outfit Set boundary tie preserves tied IDs and review status', () => {
  const response = adaptDailyOutfitStylistResponse(
    dailyResult('outfit-set-boundary-tie'),
  ).response;
  assert.equal(response.outcome, 'review-required');
  assert.equal(response.tiedOutfitIds.length, 3);
  assert.deepEqual(response.selectedOutfitIds, []);
  assert.equal(response.nextStep, 'review-tied-outfits');
  assert.equal(response.outfitEvidence.filter(({ tied }) => tied).length, 3);
});

test('insufficient candidates remain abstained with exclusions visible', () => {
  const response = adaptDailyOutfitStylistResponse(
    dailyResult('insufficient-candidates'),
  ).response;
  assert.equal(response.outcome, 'abstain');
  assert.equal(response.nextStep, 'confirm-more-current-available-outfits');
  assert.equal(response.outfitEvidence.length, 2);
  assert.equal(response.outfitEvidence.filter(({ status }) => status === 'excluded').length, 1);
});

test('malformed, unknown, and internally inconsistent results fail closed', () => {
  const source = dailyResult();
  const invalid = [
    { ...source, extra: true },
    { ...source, schemaVersion: 'daily-outfit-intent-v2' },
    { ...source, status: 'review-required' },
    { ...source, outfitSet: { ...source.outfitSet, requestId: 'wrong' } },
    {
      ...source,
      outfitSet: {
        ...source.outfitSet,
        selectedOutfitIds: ['unknown-outfit'],
      },
    },
  ];
  for (const result of invalid) {
    assert.equal(validateDailyOutfitIntentResult(result), false);
    assert.deepEqual(
      adaptDailyOutfitStylistResponse(result),
      { ok: false, error: 'valid-daily-outfit-intent-result-required' },
    );
  }
});

test('private, commercial, secret, and action-shaped injections fail closed', () => {
  const source = dailyResult();
  for (const invalid of [
    { ...source, affiliateCommission: 8 },
    { ...source, accessToken: 'secret' },
    { ...source, calendarEvent: 'private meeting' },
    { ...source, context: { ...source.context, latitude: 41.8 } },
    { ...source, outfitSet: { ...source.outfitSet, purchaseUrl: 'https://shop.invalid' } },
  ]) {
    assert.equal(validateDailyOutfitIntentResult(invalid), false);
  }
});

test('outfit evidence preserves coverage, confidence, exclusions, and references', () => {
  const source = dailyResult('insufficient-candidates');
  const response = adaptDailyOutfitStylistResponse(source).response;
  for (const evidence of response.outfitEvidence) {
    const original = source.outfitSet.evaluations.find(
      ({ outfitId }) => outfitId === evidence.outfitId,
    );
    assert.equal(evidence.evidenceCoverage, original.evidenceCoverage);
    assert.equal(evidence.confidence, original.confidence);
    assert.deepEqual(evidence.reasonCodes, original.reasonCodes);
    assert.deepEqual(evidence.compatibilityRef, original.compatibilityRef);
  }
});

test('response is minimized and cannot authorize providers, commerce, or actions', () => {
  const response = adaptDailyOutfitStylistResponse(dailyResult()).response;
  const serialized = serializeGroundedDailyOutfitStylistResponse(response).toLowerCase();
  for (const forbidden of [
    'latitude',
    'longitude',
    'calendar',
    'itinerary',
    'profile',
    'wardrobe',
    'price',
    'retailer',
    'affiliate',
    'commission',
    'checkout',
    'access_token',
  ]) assert.equal(serialized.includes(forbidden), false);
  assert.equal(response.policy.sourceRankingReused, true);
  assert.equal(response.policy.providerCallsAllowed, false);
  assert.equal(response.policy.liveContextAccessAllowed, false);
  assert.equal(response.policy.commercialInfluenceAllowed, false);
  assert.equal(response.policy.externalActionsAllowed, false);
});

test('identical accepted input serializes byte-stably', () => {
  const first = adaptDailyOutfitStylistResponse(dailyResult()).response;
  const second = adaptDailyOutfitStylistResponse(dailyResult()).response;
  assert.equal(
    serializeGroundedDailyOutfitStylistResponse(first),
    serializeGroundedDailyOutfitStylistResponse(second),
  );
});
