import { RESOLUTION_STEPS } from './daily-stylist-production-boundary-contract.mjs';
import { DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION } from './daily-stylist-production-boundary-contract.mjs';
import { runDailyStylistServiceSeam } from './daily-stylist-service-seam.mjs';
import { createFixturePrivateService } from './private-profile-service-contract.mjs';
import { PRIVATE_ACCESS_POLICY_VERSION } from './private-access-security-policy.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from './__fixtures__/personalization.mjs';

// Closed, deterministic review scenarios for issue #162's fixture service
// seam. Each scenario supplies its own synthetic session/request/private
// service inputs; the journey never invents a fourteenth state and never
// re-derives any composed contract's policy — it only selects fixture input.
export const DAILY_STYLIST_SERVICE_SEAM_SCENARIOS = Object.freeze([
  'ready-success',
  'missing-session',
  'expired-session',
  'missing-personalization-scope',
  'cross-account-access',
  'revoked-consent',
  'unresolved-profile',
  'unresolved-wardrobe-snapshot',
  'stale-snapshot',
  'insufficient-candidates',
  'unknown-context-review',
  'contradictory-context-abstention',
  'exact-selection-boundary-tie',
]);

const SCENARIO_SUMMARIES = Object.freeze({
  'ready-success': 'An authenticated, authorized, consented, current request completes every step and returns a grounded answer.',
  'missing-session': 'No session stops immediately at session authentication; nothing downstream ever runs.',
  'expired-session': 'A session past its expiry stops at session authentication, identically to a missing session.',
  'missing-personalization-scope': 'A session without the personalization:evaluate scope stops at authorization.',
  'cross-account-access': 'A session for a different account than the profile/snapshot owner stops at authorization.',
  'revoked-consent': 'Personalization consent revoked before the call stops at consent verification, after authorization passes.',
  'unresolved-profile': 'An unknown profile reference stops at profile resolution, after ownership and consent pass.',
  'unresolved-wardrobe-snapshot': 'An unknown wardrobe snapshot reference stops at snapshot verification, after the profile resolves.',
  'stale-snapshot': 'A wardrobe snapshot older than the 30-day freshness limit stops at snapshot verification.',
  'insufficient-candidates': 'Fewer than two derivable synthetic candidates stops before Daily Outfit Intent ever runs.',
  'unknown-context-review': 'An unknown season class completes but stays review-required — nothing is invented.',
  'contradictory-context-abstention': 'A warm season conflicting with cold weather completes but abstains honestly.',
  'exact-selection-boundary-tie': 'An exact ranking tie across the selection boundary completes but stays review-required, never broken.',
});

const NOW = '2026-07-25T23:45:00.000Z';
const ACCOUNT_ID = 'fixture-account-01';
const CONSENT_ID = 'fixture-consent-personalization-01';

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

function baseRequestEnvelope(overrides = {}) {
  return {
    schemaVersion: DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION,
    requestId: 'fixture-request-01',
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

// Every scenario builds its own fresh fixture private-service instance so
// consent revocation and snapshot-age mutation in one scenario never leak
// into another.
function scenarioInputs(scenarioKey) {
  const privateService = createFixturePrivateService({ nowIso: NOW });
  switch (scenarioKey) {
    case 'missing-session':
      return {
        session: undefined,
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'expired-session':
      return {
        session: baseSession({
          issuedAtIso: '2026-07-25T21:00:00.000Z',
          expiresAtIso: '2026-07-25T21:30:00.000Z',
        }),
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'missing-personalization-scope':
      return {
        session: baseSession({ scopes: ['profile:read'] }),
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'cross-account-access':
      return {
        session: baseSession({ accountId: 'another-account' }),
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'revoked-consent':
      privateService.revokeConsent({ actorAccountId: ACCOUNT_ID, consentId: CONSENT_ID, nowIso: NOW });
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'unresolved-profile':
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope({ profileReference: 'unknown-profile-01' }),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'unresolved-wardrobe-snapshot':
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope({ wardrobeSnapshotReference: 'unknown-wardrobe-snapshot-01' }),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'stale-snapshot':
      privateService.state.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID).createdAtIso = '2026-01-01T00:00:00.000Z';
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'insufficient-candidates':
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'insufficient',
      };
    case 'unknown-context-review':
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope({ seasonClass: 'unknown' }),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'contradictory-context-abstention':
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope({ seasonClass: 'warm', weatherClass: 'cold' }),
        privateService,
        fixtureCandidateMode: 'ready',
      };
    case 'exact-selection-boundary-tie':
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope({ desiredCount: 2 }),
        privateService,
        fixtureCandidateMode: 'tie',
      };
    case 'ready-success':
    default:
      return {
        session: baseSession(),
        requestEnvelope: baseRequestEnvelope(),
        privateService,
        fixtureCandidateMode: 'ready',
      };
  }
}

// Renders every RESOLUTION_STEPS entry, in order, annotated with what the
// trace actually proved: passed, failed (the first failure, if any), or
// not-executed (every step after a failure, or every step when nothing ran
// yet). This is what makes the first failed step visually obvious and proves
// downstream steps never executed — the row set is fixed and closed; the
// trace can only ever fill a passed/failed prefix of it.
function buildStepRows(result) {
  const traceByStep = new Map((result?.trace ?? []).map((entry) => [entry.step, entry]));
  return RESOLUTION_STEPS.map(({ step }) => {
    const entry = traceByStep.get(step);
    return entry
      ? { step, status: entry.outcome, reasonCode: entry.reasonCode }
      : { step, status: 'not-executed', reasonCode: null };
  });
}

export function createDailyStylistServiceSeamJourney() {
  let scenario = DAILY_STYLIST_SERVICE_SEAM_SCENARIOS[0];
  let result = null;

  function selectScenario(nextScenario) {
    if (!DAILY_STYLIST_SERVICE_SEAM_SCENARIOS.includes(nextScenario)) {
      return { ok: false, error: 'unsupported-daily-stylist-service-seam-scenario' };
    }
    scenario = nextScenario;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const inputs = scenarioInputs(scenario);
    const outcome = runDailyStylistServiceSeam({ ...inputs, nowIso: NOW });
    if (!outcome.ok) return outcome;
    result = structuredClone(outcome);
    return { ok: true, view: getView() };
  }

  function reset() {
    scenario = DAILY_STYLIST_SERVICE_SEAM_SCENARIOS[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      scenario,
      scenarioSummary: SCENARIO_SUMMARIES[scenario],
      supportedScenarios: [...DAILY_STYLIST_SERVICE_SEAM_SCENARIOS],
      steps: buildStepRows(result),
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
