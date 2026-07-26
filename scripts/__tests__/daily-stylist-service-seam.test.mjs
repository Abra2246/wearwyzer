import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_STYLIST_SERVICE_SEAM_VERSION,
  runDailyStylistServiceSeam,
  serializeDailyStylistServiceSeamResult,
} from '../daily-stylist-service-seam.mjs';
import { createFixturePrivateService } from '../private-profile-service-contract.mjs';
import { PRIVATE_ACCESS_POLICY_VERSION } from '../private-access-security-policy.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from '../__fixtures__/personalization.mjs';
import {
  DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION,
  RESOLUTION_STEPS,
} from '../daily-stylist-production-boundary-contract.mjs';

const NOW = '2026-07-25T23:45:00.000Z';
const CONSENT_ID = 'fixture-consent-personalization-01';
const ACCOUNT_ID = 'fixture-account-01';
const STEP_ORDER = RESOLUTION_STEPS.map((entry) => entry.step);

function fixtureService() {
  return createFixturePrivateService({ nowIso: NOW });
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

function requestEnvelope(overrides = {}) {
  return {
    schemaVersion: DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION,
    requestId: 'req-fixture-01',
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

function run(overrides = {}) {
  return runDailyStylistServiceSeam({
    session: session(),
    requestEnvelope: requestEnvelope(),
    privateService: fixtureService(),
    nowIso: NOW,
    ...overrides,
  });
}

test('an accepted request executes every step in the exact required order and answers', () => {
  const result = run();
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, DAILY_STYLIST_SERVICE_SEAM_VERSION);
  assert.equal(result.outcome, 'completed');
  assert.equal(result.stoppedAtStep, null);
  assert.equal(result.reasonCode, null);
  assert.deepEqual(result.trace.map((entry) => entry.step), STEP_ORDER);
  assert.ok(result.trace.every((entry) => entry.outcome === 'passed' && entry.reasonCode === null));
  assert.equal(result.response.outcome, 'answer');
  assert.equal(result.response.selectedOutfitIds.length, 2);
});

test('an invalid or unsupported request short-circuits before any resolution step runs', () => {
  const result = run({ requestEnvelope: requestEnvelope({ schemaVersion: 'daily-stylist-production-boundary-v0' }) });
  assert.deepEqual(result, { ok: false, error: 'closed-minimized-request-envelope-required' });
});

test('a missing session stops at authenticate-session with no further steps executed', () => {
  const result = run({ session: undefined });
  assert.equal(result.outcome, 'stopped');
  assert.equal(result.stoppedAtStep, 'authenticate-session');
  assert.equal(result.reasonCode, 'session-not-authenticated');
  assert.deepEqual(result.trace, [
    { step: 'authenticate-session', outcome: 'failed', reasonCode: 'session-not-authenticated' },
  ]);
  assert.equal(result.response, null);
});

test('an expired session stops at authenticate-session with no further steps executed', () => {
  const result = run({
    session: session({
      issuedAtIso: '2026-07-25T21:00:00.000Z',
      expiresAtIso: '2026-07-25T21:30:00.000Z',
    }),
  });
  assert.equal(result.stoppedAtStep, 'authenticate-session');
  assert.equal(result.reasonCode, 'session-not-authenticated');
  assert.equal(result.trace.length, 1);
  assert.equal(result.response, null);
});

test('cross-account access stops at authorize-same-account-ownership after authentication passes', () => {
  const result = run({ session: session({ accountId: 'another-account' }) });
  assert.equal(result.stoppedAtStep, 'authorize-same-account-ownership');
  assert.equal(result.reasonCode, 'cross-account-access-denied');
  assert.deepEqual(result.trace, [
    { step: 'authenticate-session', outcome: 'passed', reasonCode: null },
    { step: 'authorize-same-account-ownership', outcome: 'failed', reasonCode: 'cross-account-access-denied' },
  ]);
  assert.equal(result.response, null);
});

test('a session without personalization scope stops at authorization', () => {
  const result = run({ session: session({ scopes: ['profile:read'] }) });
  assert.equal(result.stoppedAtStep, 'authorize-same-account-ownership');
  assert.equal(result.reasonCode, 'cross-account-access-denied');
  assert.deepEqual(result.trace.map((entry) => entry.step), [
    'authenticate-session',
    'authorize-same-account-ownership',
  ]);
});

test('revoked personalization consent stops at verify-active-personalization-consent after ownership passes', () => {
  const service = fixtureService();
  const revoked = service.revokeConsent({ actorAccountId: ACCOUNT_ID, consentId: CONSENT_ID, nowIso: NOW });
  assert.equal(revoked.ok, true);
  const result = run({ privateService: service });
  assert.equal(result.stoppedAtStep, 'verify-active-personalization-consent');
  assert.equal(result.reasonCode, 'personalization-consent-revoked-or-missing');
  assert.deepEqual(result.trace, [
    { step: 'authenticate-session', outcome: 'passed', reasonCode: null },
    { step: 'authorize-same-account-ownership', outcome: 'passed', reasonCode: null },
    { step: 'verify-active-personalization-consent', outcome: 'failed', reasonCode: 'personalization-consent-revoked-or-missing' },
  ]);
  assert.equal(result.response, null);
});

test('an unresolved profile reference stops at resolve-profile-reference after ownership and consent pass', () => {
  const result = run({ requestEnvelope: requestEnvelope({ profileReference: 'unknown-profile-01' }) });
  assert.equal(result.stoppedAtStep, 'resolve-profile-reference');
  assert.equal(result.reasonCode, 'profile-reference-unresolved');
  assert.deepEqual(result.trace.map((entry) => entry.step), [
    'authenticate-session',
    'authorize-same-account-ownership',
    'verify-active-personalization-consent',
    'resolve-profile-reference',
  ]);
  assert.equal(result.response, null);
});

test('an unresolved wardrobe snapshot stops at snapshot verification after the profile resolves', () => {
  const result = run({
    requestEnvelope: requestEnvelope({
      wardrobeSnapshotReference: 'unknown-wardrobe-snapshot-01',
    }),
  });
  assert.equal(result.stoppedAtStep, 'verify-wardrobe-snapshot-current');
  assert.equal(result.reasonCode, 'wardrobe-snapshot-stale-or-unresolved');
  assert.deepEqual(result.trace.map((entry) => entry.step), [
    'authenticate-session',
    'authorize-same-account-ownership',
    'verify-active-personalization-consent',
    'resolve-profile-reference',
    'verify-wardrobe-snapshot-current',
  ]);
});

test('a stale wardrobe snapshot stops at verify-wardrobe-snapshot-current after every earlier step passes', () => {
  const service = fixtureService();
  service.state.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID).createdAtIso = '2026-01-01T00:00:00.000Z';
  const result = run({ privateService: service });
  assert.equal(result.stoppedAtStep, 'verify-wardrobe-snapshot-current');
  assert.equal(result.reasonCode, 'wardrobe-snapshot-stale-or-unresolved');
  assert.deepEqual(result.trace.map((entry) => entry.step), [
    'authenticate-session',
    'authorize-same-account-ownership',
    'verify-active-personalization-consent',
    'resolve-profile-reference',
    'verify-wardrobe-snapshot-current',
  ]);
  assert.equal(result.response, null);
});

test('insufficient closed fixture evidence stops at candidate derivation', () => {
  const result = run({ fixtureCandidateMode: 'insufficient' });
  assert.equal(result.stoppedAtStep, 'derive-minimized-outfit-candidates');
  assert.equal(result.reasonCode, 'insufficient-minimized-candidates');
  assert.deepEqual(result.trace.map((entry) => entry.step), [
    'authenticate-session',
    'authorize-same-account-ownership',
    'verify-active-personalization-consent',
    'resolve-profile-reference',
    'verify-wardrobe-snapshot-current',
    'derive-minimized-outfit-candidates',
  ]);
  assert.equal(result.response, null);
});

test('unsupported fixture candidate modes fail before service execution', () => {
  assert.deepEqual(
    run({ fixtureCandidateMode: 'live-wardrobe' }),
    { ok: false, error: 'closed-fixture-candidate-mode-required' },
  );
});

test('candidate derivation does not inspect wardrobe contents or item count', () => {
  const first = run();
  const service = fixtureService();
  service.state.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID).items = [];
  const second = run({ privateService: service });
  assert.equal(
    serializeDailyStylistServiceSeamResult(first),
    serializeDailyStylistServiceSeamResult(second),
  );
});

test('review-required context outcomes are preserved unchanged from Daily Outfit Intent', () => {
  const result = run({ requestEnvelope: requestEnvelope({ seasonClass: 'unknown' }) });
  assert.equal(result.outcome, 'completed');
  assert.equal(result.response.outcome, 'review-required');
  assert.deepEqual(result.response.reasonCodes, ['season-class-unknown']);
  assert.equal(result.response.selectedOutfitIds.length, 0);
});

test('abstention outcomes from a conflicting context are preserved unchanged', () => {
  const result = run({ requestEnvelope: requestEnvelope({ seasonClass: 'warm', weatherClass: 'cold' }) });
  assert.equal(result.outcome, 'completed');
  assert.equal(result.response.outcome, 'abstain');
  assert.deepEqual(result.response.reasonCodes, ['warm-season-conflicts-with-cold-weather']);
});

test('an exact ranking tie across the selection boundary is preserved, not broken, by the seam', () => {
  const result = run({
    fixtureCandidateMode: 'tie',
    requestEnvelope: requestEnvelope({ desiredCount: 2 }),
  });
  assert.equal(result.outcome, 'completed');
  assert.equal(result.response.outcome, 'review-required');
  assert.equal(result.response.tiedOutfitIds.length, 3);
  assert.equal(result.response.selectedOutfitIds.length, 0);
  assert.deepEqual(result.response.reasonCodes, ['outfit-set-tie-review']);
});

test('identical accepted fixture input produces a byte-stable minimized result', () => {
  const first = serializeDailyStylistServiceSeamResult(run());
  const second = serializeDailyStylistServiceSeamResult(run());
  assert.equal(first, second);

  const firstStopped = serializeDailyStylistServiceSeamResult(
    run({ session: session({ accountId: 'another-account' }) }),
  );
  const secondStopped = serializeDailyStylistServiceSeamResult(
    run({ session: session({ accountId: 'another-account' }) }),
  );
  assert.equal(firstStopped, secondStopped);
});

test('the minimized result never carries the session, raw profile, wardrobe, or consent payload', () => {
  const result = run();
  const serialized = JSON.stringify(result);
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
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false, `unexpected leak of "${value}"`);
  }
});

test('the minimized response exposes only the accepted Grounded Stylist response shape, no adapter internals', () => {
  const result = run();
  assert.deepEqual(Object.keys(result).sort(), [
    'ok',
    'outcome',
    'reasonCode',
    'requestId',
    'response',
    'schemaVersion',
    'stoppedAtStep',
    'trace',
  ]);
  assert.deepEqual(Object.keys(result.response).sort(), [
    'citations',
    'context',
    'evidenceVersion',
    'intent',
    'limitations',
    'nextStep',
    'outcome',
    'outfitEvidence',
    'policy',
    'qualifiedOutfitIds',
    'reasonCodes',
    'requestId',
    'schemaVersion',
    'selectedOutfitIds',
    'summary',
    'tiedOutfitIds',
    'title',
    'uncertainty',
  ]);
});

test('the minimized result carries no commercial, credential, or external-action field', () => {
  const result = run();
  const serialized = JSON.stringify(result);
  for (const forbiddenKey of ['price', 'affiliateUrl', 'commissionRate', 'apiKey', 'secret', 'purchase', 'notify', 'publish']) {
    assert.equal(serialized.includes(`"${forbiddenKey}"`), false, `unexpected key "${forbiddenKey}"`);
  }
  assert.equal(result.response.policy.commercialInfluenceAllowed, false);
  assert.equal(result.response.policy.externalActionsAllowed, false);
});
