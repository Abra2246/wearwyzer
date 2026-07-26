import { stableSerialize } from './ai-stylist-evaluator.mjs';
import { validatePrivateSession } from './private-access-security-policy.mjs';
import { createFixturePrivateService } from './private-profile-service-contract.mjs';
import {
  RESOLUTION_STEPS,
  planDailyStylistProductionRequest,
} from './daily-stylist-production-boundary-contract.mjs';
import { evaluateOutfitCompatibility } from './outfit-compatibility-contract.mjs';
import {
  DAILY_OUTFIT_CONTEXT_ALLOWLISTS,
  evaluateDailyOutfitIntent,
} from './daily-outfit-intent-contract.mjs';
import { adaptDailyOutfitStylistResponse } from './grounded-daily-outfit-stylist.mjs';

export const DAILY_STYLIST_SERVICE_SEAM_VERSION = 'daily-stylist-service-seam-v1';

// Fixed fixture evidence version for every synthetic candidate this seam
// derives. There is no real evidence pipeline behind this seam, so the
// version never advances.
const SEAM_EVIDENCE_VERSION = 1;
const STYLE_DNA_VERSION = 'style-dna-v1';

// One synthetic capsule per three resolved (but never inspected) wardrobe
// items. Capsule content is entirely synthetic fixture evidence — the real
// wardrobe items only gate *how many* capsules may be derived, never what
// goes in them, so nothing private ever reaches a candidate.
const CAPSULE_ITEM_ROLES = Object.freeze(['top', 'bottom', 'footwear']);
const MIN_MINIMIZED_CANDIDATES = 2;
const MAX_MINIMIZED_CANDIDATES = 4;
const CAPSULE_STYLE_SIGNALS = Object.freeze([
  Object.freeze({
    dimension: 'palette',
    value: 'navy',
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'fixture-minimized-capsule-signal',
  }),
  Object.freeze({
    dimension: 'silhouette',
    value: 'relaxed',
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'fixture-minimized-capsule-signal',
  }),
  Object.freeze({
    dimension: 'formality',
    value: 'smart-casual',
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'fixture-minimized-capsule-signal',
  }),
  Object.freeze({
    dimension: 'material',
    value: 'cotton',
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'fixture-minimized-capsule-signal',
  }),
]);

const STEP_REASON_CODES = Object.freeze(
  Object.fromEntries(RESOLUTION_STEPS.map((entry) => [entry.step, entry.failReasonCode])),
);

// getPersonalizationReferences (private-profile-service-contract.mjs) already
// composes ownership, consent, profile resolution, and snapshot-freshness
// checks in this exact order. This maps its single error code back onto the
// resolution step it corresponds to instead of re-deriving that policy here.
const REFERENCE_STEP_ORDER = Object.freeze([
  'authorize-same-account-ownership',
  'verify-active-personalization-consent',
  'resolve-profile-reference',
  'verify-wardrobe-snapshot-current',
]);
const REFERENCE_ERROR_STEP = Object.freeze({
  'access-denied': 'authorize-same-account-ownership',
  'personalization-consent-required': 'verify-active-personalization-consent',
  'private-context-not-found': 'resolve-profile-reference',
  'stale-wardrobe-snapshot': 'verify-wardrobe-snapshot-current',
});

function capsuleItem(capsuleId, role) {
  return {
    itemId: `${capsuleId}-${role}`,
    productId: `fixture-synthetic-${capsuleId}-${role}`,
    ownership: 'owned',
    role,
    evidenceState: 'current',
    aesthetics: ['minimal'],
    palette: ['navy'],
    silhouette: 'relaxed',
    formality: 'smart-casual',
    materials: ['cotton'],
    occasions: [...DAILY_OUTFIT_CONTEXT_ALLOWLISTS.occasions],
    seasons: ['transitional'],
    layering: 'base',
    riskLevel: 'balanced',
    fitStatus: 'verified',
  };
}

function minimizedCapsuleCandidate(capsuleId, occasion) {
  const compatibility = evaluateOutfitCompatibility({
    outfitId: capsuleId,
    evidenceVersion: SEAM_EVIDENCE_VERSION,
    styleDnaVersion: STYLE_DNA_VERSION,
    styleSignals: CAPSULE_STYLE_SIGNALS,
    target: { occasion, season: 'transitional' },
    items: CAPSULE_ITEM_ROLES.map((role) => capsuleItem(capsuleId, role)),
  });
  if (!compatibility.ok) return null;
  return {
    candidateId: capsuleId,
    compatibility: compatibility.result,
    formula: {
      silhouette: `${capsuleId}-silhouette`,
      palette: `${capsuleId}-palette`,
      layering: `${capsuleId}-layering`,
      formality: `${capsuleId}-formality`,
      occasionExecution: `${capsuleId}-execution`,
    },
  };
}

// Derivation only ever consumes the *count* of resolved wardrobe items, never
// their identity — the count is the sole trust signal for how many minimized
// synthetic candidates may be derived.
function deriveMinimizedCandidates(resolvedWardrobeItemCount, occasion) {
  const capsuleCount = Math.max(0, Math.min(
    Math.floor(resolvedWardrobeItemCount / CAPSULE_ITEM_ROLES.length),
    MAX_MINIMIZED_CANDIDATES,
  ));
  const candidates = [];
  for (let index = 1; index <= capsuleCount; index += 1) {
    const candidate = minimizedCapsuleCandidate(`minimized-capsule-${index}`, occasion);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function freezeTrace(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

export function runDailyStylistServiceSeam({
  session,
  requestEnvelope,
  privateService,
  nowIso = new Date().toISOString(),
} = {}) {
  const planned = planDailyStylistProductionRequest(requestEnvelope);
  if (!planned.ok) {
    return { ok: false, error: planned.error };
  }
  const request = planned.result;
  const service = privateService ?? createFixturePrivateService({ nowIso });
  const entries = [];

  function stop(step) {
    const reasonCode = STEP_REASON_CODES[step];
    entries.push({ step, outcome: 'failed', reasonCode });
    return {
      ok: true,
      schemaVersion: DAILY_STYLIST_SERVICE_SEAM_VERSION,
      requestId: request.requestId,
      outcome: 'stopped',
      stoppedAtStep: step,
      reasonCode,
      trace: freezeTrace(entries),
      response: null,
    };
  }

  function pass(step) {
    entries.push({ step, outcome: 'passed', reasonCode: null });
  }

  // Step 1: authenticate-session — composed from the accepted private-access
  // security policy.
  const sessionValidation = validatePrivateSession(session, { nowIso });
  if (!sessionValidation.valid) return stop('authenticate-session');
  pass('authenticate-session');

  // Steps 2-5: ownership, consent, profile resolution, snapshot freshness —
  // composed from the accepted fixture private profile/wardrobe service in
  // the single order it already enforces internally.
  const references = service.getPersonalizationReferences({
    actorAccountId: session.accountId,
    profileId: request.profileReference,
    wardrobeSnapshotId: request.wardrobeSnapshotReference,
    nowIso,
  });
  if (!references.ok) {
    const failedStep = REFERENCE_ERROR_STEP[references.error] ?? 'authorize-same-account-ownership';
    const failedIndex = REFERENCE_STEP_ORDER.indexOf(failedStep);
    for (let index = 0; index < failedIndex; index += 1) pass(REFERENCE_STEP_ORDER[index]);
    return stop(failedStep);
  }
  pass('authorize-same-account-ownership');
  pass('verify-active-personalization-consent');
  pass('resolve-profile-reference');
  pass('verify-wardrobe-snapshot-current');

  // Step 6: derive-minimized-outfit-candidates
  const wardrobeSnapshot = service.state.wardrobeSnapshots.get(references.wardrobeSnapshotId);
  const candidates = deriveMinimizedCandidates(wardrobeSnapshot.items.length, request.context.occasion);
  if (candidates.length < MIN_MINIMIZED_CANDIDATES) return stop('derive-minimized-outfit-candidates');
  pass('derive-minimized-outfit-candidates');

  // Step 7: delegate-daily-outfit-intent — ready, review-required, tie, and
  // abstention outcomes are decided entirely by this accepted contract; the
  // seam only forwards its exact result.
  const intentResult = evaluateDailyOutfitIntent({
    requestId: request.requestId,
    evidenceVersion: SEAM_EVIDENCE_VERSION,
    ...request.context,
    desiredCount: request.desiredCount,
    candidates,
  });
  if (!intentResult.ok) return stop('delegate-daily-outfit-intent');
  pass('delegate-daily-outfit-intent');

  // Step 8: adapt-grounded-stylist-response — wording, uncertainty, and
  // citations are decided entirely by this accepted contract.
  const grounded = adaptDailyOutfitStylistResponse(intentResult.result);
  if (!grounded.ok) return stop('adapt-grounded-stylist-response');
  pass('adapt-grounded-stylist-response');

  return {
    ok: true,
    schemaVersion: DAILY_STYLIST_SERVICE_SEAM_VERSION,
    requestId: request.requestId,
    outcome: 'completed',
    stoppedAtStep: null,
    reasonCode: null,
    trace: freezeTrace(entries),
    response: grounded.response,
  };
}

export function serializeDailyStylistServiceSeamResult(result) {
  return stableSerialize(result);
}
