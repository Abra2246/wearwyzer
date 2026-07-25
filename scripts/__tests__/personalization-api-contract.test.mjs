import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFixturePersonalizationContext,
  evaluatePersonalizationRequest,
  findPrivatePayloadKeys,
  PERSONALIZATION_REQUEST_VERSION,
  PERSONALIZATION_RESPONSE_VERSION,
  validatePersonalizationRequest,
  validatePersonalizationResponse,
} from '../personalization-api-contract.mjs';
import { SCORING_VERSION } from '../personalization-engine.mjs';
import {
  FIXTURE_CANDIDATE_ID,
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from '../__fixtures__/personalization.mjs';

const NOW = '2026-07-25T23:30:00.000Z';

function validRequest(overrides = {}) {
  return {
    schemaVersion: PERSONALIZATION_REQUEST_VERSION,
    requestId: 'fixture-request-001',
    scoringVersion: SCORING_VERSION,
    subject: {
      profileId: FIXTURE_PROFILE.id,
      wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
    },
    candidate: {
      productId: FIXTURE_CANDIDATE_ID,
      matchState: 'exact',
      matchConfidence: 1,
    },
    consent: { personalization: true },
    requestedAtIso: NOW,
    ...overrides,
  };
}

test('closed request schema accepts the minimum reference-only contract', () => {
  const request = validRequest();
  const result = validatePersonalizationRequest(request);
  assert.deepEqual(result, { valid: true, errors: [] });
  assert.deepEqual(Object.keys(request.subject).sort(), ['profileId', 'wardrobeSnapshotId']);
  assert.equal('wardrobe' in request, false);
  assert.equal('profile' in request, false);
});

test('fixture adapter returns a closed privacy-minimized response', () => {
  const response = evaluatePersonalizationRequest(
    validRequest(),
    createFixturePersonalizationContext(),
    { nowIso: NOW },
  );

  assert.equal(response.status, 'ok');
  assert.equal(response.schemaVersion, PERSONALIZATION_RESPONSE_VERSION);
  assert.equal(response.candidate.matchState, 'exact');
  assert.equal(response.scores.outfitUnlocks, 3);
  assert.equal(response.outfits.length, 3);
  assert.deepEqual(findPrivatePayloadKeys(response), []);
  assert.deepEqual(validatePersonalizationResponse(response), { valid: true, errors: [] });
  assert.ok(response.outfits.every((outfit) =>
    outfit.items.every((item) => ['owned', 'prospective', 'missing'].includes(item.state))
  ));
});

test('response exposes only owned items used in the active outfit decision', () => {
  const response = evaluatePersonalizationRequest(validRequest(), undefined, { nowIso: NOW });
  const returnedOwnedIds = new Set(
    response.outfits.flatMap((outfit) =>
      outfit.items.filter((item) => item.state === 'owned').map((item) => item.productId)
    )
  );
  assert.ok(returnedOwnedIds.size > 0);
  assert.equal('wardrobeSnapshot' in response, false);
  assert.equal('productIds' in response.subjectRefs, false);
});

test('unsupported versions, missing consent, and over-broad request keys fail closed', () => {
  const unsupported = validatePersonalizationRequest(validRequest({ scoringVersion: 'future-v9' }));
  assert.equal(unsupported.valid, false);
  assert.match(unsupported.errors.join('\n'), /unsupported version/);

  const missingConsent = evaluatePersonalizationRequest(
    validRequest({ consent: { personalization: false } }),
    undefined,
    { nowIso: NOW },
  );
  assert.equal(missingConsent.status, 'error');
  assert.match(missingConsent.error, /explicit true/);

  const broad = validatePersonalizationRequest(validRequest({
    wardrobe: [{ productId: 'private-item' }],
  }));
  assert.equal(broad.valid, false);
  assert.match(broad.errors.join('\n'), /unknown key "wardrobe"/);
});

test('unknown and ambiguous product matches are explicit non-evaluation outcomes', () => {
  const unknown = evaluatePersonalizationRequest(validRequest({
    candidate: {
      productId: FIXTURE_CANDIDATE_ID,
      matchState: 'unknown',
      matchConfidence: 0,
    },
  }), undefined, { nowIso: NOW });
  assert.equal(unknown.error, 'unknown-product-match');

  const ambiguous = evaluatePersonalizationRequest(validRequest({
    candidate: {
      productId: FIXTURE_CANDIDATE_ID,
      matchState: 'similar',
      matchConfidence: 0.72,
    },
  }), undefined, { nowIso: NOW });
  assert.equal(ambiguous.error, 'ambiguous-product-match');
});

test('stale product evidence fails before scoring', () => {
  const context = createFixturePersonalizationContext();
  context.facts = context.facts.map((fact) =>
    fact.id === FIXTURE_CANDIDATE_ID
      ? { ...fact, sourceVerifiedAt: '2025-01-01T00:00:00.000Z' }
      : fact
  );
  const response = evaluatePersonalizationRequest(validRequest(), context, { nowIso: NOW });
  assert.equal(response.status, 'error');
  assert.equal(response.error, 'stale-product-source');
});

test('missing profile, wardrobe snapshot, and insufficient wardrobe fail closed', () => {
  const missingProfile = evaluatePersonalizationRequest(validRequest({
    subject: {
      profileId: 'missing-profile',
      wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
    },
  }), undefined, { nowIso: NOW });
  assert.equal(missingProfile.error, 'profile-not-found');

  const missingWardrobe = evaluatePersonalizationRequest(validRequest({
    subject: {
      profileId: FIXTURE_PROFILE.id,
      wardrobeSnapshotId: 'missing-wardrobe',
    },
  }), undefined, { nowIso: NOW });
  assert.equal(missingWardrobe.error, 'wardrobe-snapshot-not-found');

  const context = createFixturePersonalizationContext();
  context.wardrobeSnapshots.set(FIXTURE_WARDROBE_SNAPSHOT_ID, {
    id: FIXTURE_WARDROBE_SNAPSHOT_ID,
    items: context.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID).items.slice(0, 4),
  });
  const insufficient = evaluatePersonalizationRequest(validRequest(), context, { nowIso: NOW });
  assert.equal(insufficient.error, 'insufficient-wardrobe');
});

test('closed response schema rejects private or over-broad payloads', () => {
  const response = evaluatePersonalizationRequest(validRequest(), undefined, { nowIso: NOW });
  const leaked = { ...response, wardrobe: [{ productId: 'secret-owned-item' }] };
  const result = validatePersonalizationResponse(leaked);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unknown key "wardrobe"/);
  assert.match(findPrivatePayloadKeys(leaked).join('\n'), /private key "wardrobe"/);
});
