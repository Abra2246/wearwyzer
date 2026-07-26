import { runDailyStylistWebTransportBoundary } from './daily-stylist-web-transport-boundary.mjs';
import { DAILY_STYLIST_WEB_TRANSPORT_CONTEXT_VERSION } from './daily-stylist-web-transport-boundary.mjs';
import { createFixturePrivateService } from './private-profile-service-contract.mjs';
import { PRIVATE_ACCESS_POLICY_VERSION } from './private-access-security-policy.mjs';
import { DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION } from './daily-stylist-production-boundary-contract.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from './__fixtures__/personalization.mjs';

// Closed, deterministic review scenarios for issue #171's fixture web
// transport journey. Each scenario supplies its own synthetic transport
// context / request body / session / private-service input; the journey
// never re-derives any composed contract's transport, authentication,
// authorization, consent, freshness, ranking, tie, or abstention policy — it
// only selects which closed fixture input to hand the already-accepted
// runDailyStylistWebTransportBoundary (issue #168).
export const DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS = Object.freeze([
  'ready',
  'review-required-unknown-context',
  'abstained-conflicting-context',
  'exact-tie',
  'non-post',
  'non-json',
  'unverified-same-origin',
  'failed-csrf',
  'request-id-mismatch',
  'invalid-request-id',
  'missing-session',
  'expired-session',
  'missing-scope',
  'cross-account-access',
  'revoked-consent',
  'unresolved-profile',
  'unresolved-snapshot',
  'stale-snapshot',
  'insufficient-evidence',
  'service-unavailable',
]);

const SCENARIO_SUMMARIES = Object.freeze({
  ready: 'A fully accepted transport context and request produce a trusted, ready answer.',
  'review-required-unknown-context': 'An accepted request with an unknown season class completes but stays review-required.',
  'abstained-conflicting-context': 'An accepted request with a warm season conflicting with cold weather completes but honestly abstains.',
  'exact-tie': 'An accepted request lands on an exact selection-boundary tie and stays review-required, never broken.',
  'non-post': 'A non-POST method fails the closed transport context before the service seam ever runs.',
  'non-json': 'A non-JSON media type fails the closed transport context before the service seam ever runs.',
  'unverified-same-origin': 'A same-origin result that is not exactly true fails the closed transport context.',
  'failed-csrf': 'A failed CSRF result fails the closed transport context.',
  'request-id-mismatch': 'A trusted, well-formed request ID that does not match the accepted body fails the closed transport context; the trusted ID is still the only value ever echoed.',
  'invalid-request-id': 'A malformed request ID fails the closed transport context; no request ID is echoed and the untrusted browser-supplied value is never reflected.',
  'missing-session': 'No session stops at session authentication before any private record is read.',
  'expired-session': 'A session past its expiry stops at session authentication, identically to a missing session.',
  'missing-scope': 'A session without the personalization:evaluate scope stops at authorization.',
  'cross-account-access': 'A session for a different account than the profile/snapshot owner stops at authorization.',
  'revoked-consent': 'Personalization consent revoked before the call stops at consent verification, after authorization passes.',
  'unresolved-profile': 'An unknown profile reference stops after ownership and consent pass, with no existence oracle.',
  'unresolved-snapshot': 'An unknown wardrobe snapshot reference stops after the profile resolves.',
  'stale-snapshot': 'A wardrobe snapshot older than the fixture freshness limit stops at the same client status as an unresolved snapshot.',
  'insufficient-evidence': 'Fewer than two derivable synthetic candidates stops before Daily Outfit Intent ever runs; the client is asked to review wardrobe evidence, never to buy or add clothing.',
  'service-unavailable': 'An unsupported internal fixture mode fails closed without exposing an internal detail.',
});

const NOW = '2026-07-25T23:45:00.000Z';
const ACCOUNT_ID = 'fixture-account-01';
const CONSENT_ID = 'fixture-consent-personalization-01';
const REQUEST_ID = 'req-fixture-01';

function baseSession(overrides = {}) {
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

function baseRequestBody(overrides = {}) {
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

function baseTransportContext(overrides = {}) {
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

// Every scenario builds its own fresh fixture private-service instance so
// consent revocation and snapshot-age mutation in one scenario never leak
// into another.
function scenarioInputs(scenarioKey) {
  const privateService = createFixturePrivateService({ nowIso: NOW });
  switch (scenarioKey) {
    case 'review-required-unknown-context':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody({ seasonClass: 'unknown' }),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'abstained-conflicting-context':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody({ seasonClass: 'warm', weatherClass: 'cold' }),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'exact-tie':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'tie',
      };
    case 'non-post':
      return {
        transportContext: baseTransportContext({ method: 'GET' }),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'non-json':
      return {
        transportContext: baseTransportContext({ mediaType: 'text/plain' }),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'unverified-same-origin':
      return {
        transportContext: baseTransportContext({ sameOriginVerified: false }),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'failed-csrf':
      return {
        transportContext: baseTransportContext({ csrfVerified: false }),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'request-id-mismatch':
      return {
        transportContext: baseTransportContext({ requestId: 'req-trusted-middleware-01' }),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'invalid-request-id':
      return {
        transportContext: baseTransportContext({ requestId: 'invalid request id' }),
        requestBody: baseRequestBody({ requestId: 'browser-supplied-value-do-not-echo' }),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'missing-session':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: undefined,
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'expired-session':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession({
          issuedAtIso: '2026-07-25T21:00:00.000Z',
          expiresAtIso: '2026-07-25T21:30:00.000Z',
        }),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'missing-scope':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession({ scopes: ['profile:read'] }),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'cross-account-access':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession({ accountId: 'another-account' }),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'revoked-consent':
      privateService.revokeConsent({ actorAccountId: ACCOUNT_ID, consentId: CONSENT_ID, nowIso: NOW });
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'unresolved-profile':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody({ profileReference: 'unknown-profile-01' }),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'unresolved-snapshot':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody({ wardrobeSnapshotReference: 'unknown-wardrobe-snapshot-01' }),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'stale-snapshot':
      privateService.state.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID).createdAtIso = '2026-01-01T00:00:00.000Z';
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'insufficient-evidence':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'insufficient',
      };
    case 'service-unavailable':
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'live-wardrobe',
      };
    case 'ready':
    default:
      return {
        transportContext: baseTransportContext(),
        requestBody: baseRequestBody(),
        session: baseSession(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
  }
}

// A fixed, non-sensitive summary of the scenario's own closed transport
// context input — never the seam's trace, never a raw request ID. It is
// derived once from the same fixed scenario input the journey already
// selected, not recomputed from any result.
function transportCheckSummary(scenarioKey) {
  const { transportContext, requestBody } = scenarioInputs(scenarioKey);
  return {
    method: transportContext.method,
    mediaType: transportContext.mediaType,
    sameOriginVerified: transportContext.sameOriginVerified,
    csrfVerified: transportContext.csrfVerified,
    requestIdMatchesBody: transportContext.requestId === requestBody?.requestId,
  };
}

export function createDailyStylistWebTransportFixtureJourney() {
  let scenario = DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS[0];
  let result = null;

  function selectScenario(nextScenario) {
    if (!DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS.includes(nextScenario)) {
      return { ok: false, error: 'unsupported-daily-stylist-web-transport-fixture-scenario' };
    }
    scenario = nextScenario;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const inputs = scenarioInputs(scenario);
    const outcome = runDailyStylistWebTransportBoundary({ ...inputs, nowIso: NOW });
    if (!outcome.ok) return outcome;
    result = structuredClone(outcome);
    return { ok: true, view: getView() };
  }

  function reset() {
    scenario = DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      scenario,
      scenarioSummary: SCENARIO_SUMMARIES[scenario],
      supportedScenarios: [...DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS],
      transportCheckSummary: transportCheckSummary(scenario),
      result: result ? structuredClone(result) : null,
      liveContextAvailable: false,
      privateDataAvailable: false,
      persistenceAvailable: false,
      networkActionsAvailable: false,
      commerceActionsAvailable: false,
      externalActionsAvailable: false,
    };
  }

  return { selectScenario, run, reset, getView };
}
