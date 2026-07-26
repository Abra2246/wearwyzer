import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_STYLIST_WEB_TRANSPORT_CONTEXT_VERSION,
  DAILY_STYLIST_WEB_TRANSPORT_RESPONSE_VERSION,
  runDailyStylistWebTransportBoundary,
  serializeDailyStylistWebTransportResponse,
  validateWebTransportContext,
} from '../daily-stylist-web-transport-boundary.mjs';
import { createFixturePrivateService } from '../private-profile-service-contract.mjs';
import { PRIVATE_ACCESS_POLICY_VERSION } from '../private-access-security-policy.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from '../__fixtures__/personalization.mjs';
import { DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION } from '../daily-stylist-production-boundary-contract.mjs';

const NOW = '2026-07-25T23:45:00.000Z';
const CONSENT_ID = 'fixture-consent-personalization-01';
const ACCOUNT_ID = 'fixture-account-01';
const REQUEST_ID = 'req-fixture-01';

function fixtureService() {
  return createFixturePrivateService({ nowIso: NOW });
}

// A private-service stand-in that throws on any access. Used to prove that a
// transport- or envelope-level rejection never reaches the delegated seam —
// if the seam (or anything it calls) so much as reads a property off this
// object, the test fails with a thrown error instead of a clean assertion.
function poisonedPrivateService() {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(`private service accessed after a pre-seam rejection: ${String(prop)}`);
    },
  });
}

function session(overrides = {}) {
  return {
    schemaVersion: PRIVATE_ACCESS_POLICY_VERSION,
    sessionId: 'fixture-session-01',
    accountId: ACCOUNT_ID,
    authSubject: 'fixture-auth-subject-01',
    client: 'web',
    scopes: ['personalization:evaluate'],
    issuedAtIso: '2026-07-25T23:30:00.000Z',
    expiresAtIso: '2026-07-26T00:00:00.000Z',
    csrfVerified: true,
    ...overrides,
  };
}

function requestBody(overrides = {}) {
  return {
    schemaVersion: DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION,
    requestId: REQUEST_ID,
    requestedAtIso: NOW,
    profileReference: FIXTURE_PROFILE.id,
    wardrobeSnapshotReference: FIXTURE_WARDROBE_SNAPSHOT_ID,
    occasion: 'everyday',
    seasonClass: 'transitional',
    weatherClass: 'dry',
    dressCode: 'casual',
    availabilityWindow: 'today',
    desiredCount: 2,
    ...overrides,
  };
}

function transportContext(overrides = {}) {
  return {
    schemaVersion: DAILY_STYLIST_WEB_TRANSPORT_CONTEXT_VERSION,
    method: 'POST',
    mediaType: 'application/json',
    sameOriginVerified: true,
    csrfVerified: true,
    requestId: REQUEST_ID,
    ...overrides,
  };
}

function run(overrides = {}) {
  return runDailyStylistWebTransportBoundary({
    transportContext: transportContext(),
    requestBody: requestBody(),
    session: session(),
    privateService: fixtureService(),
    nowIso: NOW,
    ...overrides,
  });
}

test('an accepted request produces the ready client status and the unmodified Grounded Stylist response', () => {
  const result = run();
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, DAILY_STYLIST_WEB_TRANSPORT_RESPONSE_VERSION);
  assert.equal(result.requestId, REQUEST_ID);
  assert.equal(result.status, 'ready');
  assert.equal(result.nextStep, 'review-selected-outfit-options');
  assert.equal(result.response.outcome, 'answer');
  assert.equal(result.response.selectedOutfitIds.length, 2);
});

test('an unknown-context request produces the review-required client status', () => {
  const result = run({ requestBody: requestBody({ seasonClass: 'unknown' }) });
  assert.equal(result.status, 'review-required');
  assert.equal(result.nextStep, 'confirm-explicit-context');
  assert.equal(result.response.outcome, 'review-required');
});

test('a contradictory context produces the abstained client status', () => {
  const result = run({ requestBody: requestBody({ seasonClass: 'warm', weatherClass: 'cold' }) });
  assert.equal(result.status, 'abstained');
  assert.equal(result.nextStep, 'resolve-context-conflict');
  assert.equal(result.response.outcome, 'abstain');
});

test('an exact selection-boundary tie produces the review-required client status', () => {
  const result = run({ fixtureCandidateMode: 'tie' });
  assert.equal(result.status, 'review-required');
  assert.equal(result.response.tiedOutfitIds.length, 3);
  assert.equal(result.response.selectedOutfitIds.length, 0);
});

for (const [label, overrides] of [
  ['a non-POST method', { transportContext: transportContext({ method: 'GET' }) }],
  ['a non-JSON media type', { transportContext: transportContext({ mediaType: 'text/plain' }) }],
  ['an unverified same-origin result', { transportContext: transportContext({ sameOriginVerified: false }) }],
  ['a failed CSRF result', { transportContext: transportContext({ csrfVerified: false }) }],
  ['a request-ID that does not match the accepted body', { transportContext: transportContext({ requestId: 'req-other-01' }) }],
  ['an unsupported transport context version', { transportContext: transportContext({ schemaVersion: 'daily-stylist-web-transport-context-v0' }) }],
  ['an unknown transport context field', { transportContext: { ...transportContext(), extra: true } }],
]) {
  test(`${label} is rejected before the service seam runs`, () => {
    const result = run({ ...overrides, privateService: poisonedPrivateService() });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'request-rejected');
    assert.equal(result.nextStep, 'resend-valid-request');
    assert.equal(result.response, null);
  });
}

for (const [label, override] of [
  ['an unsupported schema version', { schemaVersion: 'daily-stylist-production-boundary-v0' }],
  ['an unknown field', { extraField: 'unexpected' }],
  ['a credential-bearing field', { credentials: { apiKey: 'secret' } }],
  ['an embedded raw profile payload', { profile: { name: 'Fixture Person' } }],
  ['an embedded raw wardrobe payload', { wardrobe: [{ productId: 'fixture-item' }] }],
  ['a live-context field', { exactLocation: { lat: 40.7, lng: -74.0 } }],
  ['a commercial field', { affiliateOffer: { retailer: 'acme', commissionRate: 0.1 } }],
  ['an external-action field', { publish: { platform: 'instagram' } }],
  ['a client-asserted authorization field', { authorized: true }],
  ['a client-asserted consent field', { consentVerified: true }],
  ['a client-asserted ranking field', { ranking: [{ outfitId: 'fixture-outfit-1', score: 0.9 }] }],
]) {
  test(`a request body with ${label} is rejected before the service seam runs`, () => {
    const body = requestBody(override);
    const result = run({
      requestBody: body,
      transportContext: transportContext({ requestId: body.requestId }),
      privateService: poisonedPrivateService(),
    });
    assert.equal(result.status, 'request-rejected');
    assert.equal(result.response, null);
  });
}

test('validateWebTransportContext exposes the same closed check the boundary uses', () => {
  assert.deepEqual(validateWebTransportContext(transportContext(), requestBody()), { ok: true });
  assert.deepEqual(
    validateWebTransportContext(transportContext({ method: 'PUT' }), requestBody()),
    { ok: false, error: 'closed-web-transport-context-required' },
  );
});

const STOPPED_SCENARIOS = [
  ['a missing session', 'unauthenticated', { session: undefined }],
  ['an expired session', 'unauthenticated', {
    session: session({ issuedAtIso: '2026-07-25T21:00:00.000Z', expiresAtIso: '2026-07-25T21:30:00.000Z' }),
  }],
  ['cross-account access', 'unauthorized', { session: session({ accountId: 'another-account' }) }],
  ['a missing personalization scope', 'unauthorized', { session: session({ scopes: ['profile:read'] }) }],
  ['an unresolved profile reference', 'unresolved-context', {
    requestBody: requestBody({ profileReference: 'unknown-profile-01' }),
    transportContext: transportContext({ requestId: REQUEST_ID }),
  }],
  ['an unresolved wardrobe snapshot reference', 'stale-snapshot', {
    requestBody: requestBody({ wardrobeSnapshotReference: 'unknown-wardrobe-snapshot-01' }),
    transportContext: transportContext({ requestId: REQUEST_ID }),
  }],
  ['insufficient fixture candidates', 'insufficient-candidates', { fixtureCandidateMode: 'insufficient' }],
];

for (const [label, expectedStatus, overrides] of STOPPED_SCENARIOS) {
  test(`${label} maps to the ${expectedStatus} client status with no response payload`, () => {
    const result = run(overrides);
    assert.equal(result.ok, true);
    assert.equal(result.status, expectedStatus);
    assert.equal(result.nextStep, {
      unauthenticated: 'sign-in-required',
      unauthorized: 'switch-to-authorized-account',
      'consent-required': 'grant-personalization-consent',
      'unresolved-context': 'reconnect-profile-reference',
      'stale-snapshot': 'refresh-wardrobe-snapshot',
      'insufficient-candidates': 'add-more-wardrobe-items',
    }[expectedStatus]);
    assert.equal(result.response, null);
  });
}

test('revoked personalization consent maps to the consent-required client status', () => {
  const service = fixtureService();
  const revoked = service.revokeConsent({ actorAccountId: ACCOUNT_ID, consentId: CONSENT_ID, nowIso: NOW });
  assert.equal(revoked.ok, true);
  const result = run({ privateService: service });
  assert.equal(result.status, 'consent-required');
  assert.equal(result.nextStep, 'grant-personalization-consent');
  assert.equal(result.response, null);
});

test('a stale wardrobe snapshot maps to the stale-snapshot client status', () => {
  const service = fixtureService();
  service.state.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID).createdAtIso = '2026-01-01T00:00:00.000Z';
  const result = run({ privateService: service });
  assert.equal(result.status, 'stale-snapshot');
  assert.equal(result.response, null);
});

test('every stopped client response has exactly the closed key set and no trace, session, or reason detail', () => {
  for (const [, , overrides] of STOPPED_SCENARIOS) {
    const result = run(overrides);
    assert.deepEqual(
      Object.keys(result).sort(),
      ['nextStep', 'ok', 'requestId', 'response', 'schemaVersion', 'status'],
    );
  }
});

test('an unresolved profile reference and a truly nonexistent one produce byte-identical stopped responses', () => {
  const first = serializeDailyStylistWebTransportResponse(
    run({
      requestBody: requestBody({ profileReference: 'unknown-profile-01' }),
      transportContext: transportContext({ requestId: REQUEST_ID }),
    }),
  );
  const second = serializeDailyStylistWebTransportResponse(
    run({
      requestBody: requestBody({ profileReference: 'unknown-profile-02' }),
      transportContext: transportContext({ requestId: REQUEST_ID }),
    }),
  );
  assert.equal(first, second);
});

test('identical accepted input produces a byte-stable client response for completed and stopped outcomes', () => {
  const firstReady = serializeDailyStylistWebTransportResponse(run());
  const secondReady = serializeDailyStylistWebTransportResponse(run());
  assert.equal(firstReady, secondReady);

  const firstStopped = serializeDailyStylistWebTransportResponse(run({ session: undefined }));
  const secondStopped = serializeDailyStylistWebTransportResponse(run({ session: undefined }));
  assert.equal(firstStopped, secondStopped);
});

test('the client response never carries the session, raw profile, wardrobe, or consent payload', () => {
  const scenarios = [run(), run({ session: session({ accountId: 'another-account' }) }), run({ session: undefined })];
  const forbiddenValues = [
    'fixture-session-01',
    'fixture-auth-subject-01',
    CONSENT_ID,
    FIXTURE_PROFILE.audience,
    ...FIXTURE_PROFILE.preferredColors,
    ...FIXTURE_PROFILE.preferredAesthetics,
    ...FIXTURE_WARDROBE.map((item) => item.id),
    ...FIXTURE_WARDROBE.map((item) => item.productId),
  ];
  for (const result of scenarios) {
    const serialized = JSON.stringify(result);
    for (const value of forbiddenValues) {
      assert.equal(serialized.includes(value), false, `unexpected leak of "${value}"`);
    }
  }
});

test('the client response never carries the internal step trace or a raw seam reason code', () => {
  const result = run({ session: undefined });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('"trace"'), false);
  assert.equal(serialized.includes('"reasonCode"'), false);
  assert.equal(serialized.includes('"stoppedAtStep"'), false);
  assert.equal(serialized.includes('session-not-authenticated'), false);
});

test('the client response carries no commercial, credential, or external-action field', () => {
  const result = run();
  const serialized = JSON.stringify(result);
  for (const forbiddenKey of ['price', 'affiliateUrl', 'commissionRate', 'apiKey', 'secret', 'purchase', 'notify', 'publish']) {
    assert.equal(serialized.includes(`"${forbiddenKey}"`), false, `unexpected key "${forbiddenKey}"`);
  }
  assert.equal(result.response.policy.commercialInfluenceAllowed, false);
  assert.equal(result.response.policy.externalActionsAllowed, false);
});

test('an unsupported fixture candidate mode fails closed without exposing an internal detail', () => {
  const result = run({ fixtureCandidateMode: 'live-wardrobe' });
  assert.equal(result.status, 'service-unavailable');
  assert.equal(result.response, null);
});
