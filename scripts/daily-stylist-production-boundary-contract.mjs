import { stableSerialize } from './ai-stylist-evaluator.mjs';
import {
  DAILY_OUTFIT_CONTEXT_ALLOWLISTS,
  DAILY_OUTFIT_INTENT_VERSION,
} from './daily-outfit-intent-contract.mjs';
import { GROUNDED_DAILY_OUTFIT_STYLIST_VERSION } from './grounded-daily-outfit-stylist.mjs';

export const DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION = 'daily-stylist-production-boundary-v1';

const ENVELOPE_KEYS = new Set([
  'schemaVersion',
  'requestId',
  'requestedAtIso',
  'profileReference',
  'wardrobeSnapshotReference',
  'occasion',
  'seasonClass',
  'weatherClass',
  'dressCode',
  'availabilityWindow',
  'desiredCount',
]);

const OCCASIONS = new Set(DAILY_OUTFIT_CONTEXT_ALLOWLISTS.occasions);
const SEASONS = new Set(DAILY_OUTFIT_CONTEXT_ALLOWLISTS.seasonClasses);
const WEATHER = new Set(DAILY_OUTFIT_CONTEXT_ALLOWLISTS.weatherClasses);
const DRESS_CODES = new Set(DAILY_OUTFIT_CONTEXT_ALLOWLISTS.dressCodes);
const AVAILABILITY = new Set(DAILY_OUTFIT_CONTEXT_ALLOWLISTS.availabilityWindows);
const DESIRED_COUNTS = new Set(DAILY_OUTFIT_CONTEXT_ALLOWLISTS.desiredCounts);

// The required server-side resolution order (docs/DAILY_STYLIST_PRODUCTION_BOUNDARY_V1.md).
// Each step names the exact fail-closed reason code a future authenticated
// server must stop with if that step does not succeed. This contract only
// documents the order and the reason codes — it never resolves a real
// account, consent, profile, wardrobe snapshot, or candidate, and it never
// executes the plan.
export const RESOLUTION_STEPS = Object.freeze([
  Object.freeze({ step: 'authenticate-session', failReasonCode: 'session-not-authenticated' }),
  Object.freeze({
    step: 'authorize-same-account-ownership',
    failReasonCode: 'cross-account-access-denied',
  }),
  Object.freeze({
    step: 'verify-active-personalization-consent',
    failReasonCode: 'personalization-consent-revoked-or-missing',
  }),
  Object.freeze({ step: 'resolve-profile-reference', failReasonCode: 'profile-reference-unresolved' }),
  Object.freeze({
    step: 'verify-wardrobe-snapshot-current',
    failReasonCode: 'wardrobe-snapshot-stale-or-unresolved',
  }),
  Object.freeze({
    step: 'derive-minimized-outfit-candidates',
    failReasonCode: 'insufficient-minimized-candidates',
  }),
  Object.freeze({
    step: 'delegate-daily-outfit-intent',
    failReasonCode: 'daily-outfit-intent-not-ready',
  }),
  Object.freeze({
    step: 'adapt-grounded-stylist-response',
    failReasonCode: 'grounded-stylist-response-not-ready',
  }),
]);

const FIXED_POLICY = Object.freeze({
  requestEnvelopeIsClosed: true,
  clientMayAssertAuthorization: false,
  clientMayAssertConsent: false,
  clientMayAssertSnapshotFreshness: false,
  clientMayAssertOwnership: false,
  clientMayAssertRankingOrOutcome: false,
  realRecordResolutionAllowed: false,
  planExecutionAllowed: false,
  liveContextAccessAllowed: false,
  commercialInfluenceAllowed: false,
  externalActionsAllowed: false,
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stableReference(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isIso(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export function planDailyStylistProductionRequest(input) {
  if (
    !exactKeys(input, ENVELOPE_KEYS)
    || input.schemaVersion !== DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION
    || !stableReference(input.requestId)
    || !isIso(input.requestedAtIso)
    || !stableReference(input.profileReference)
    || !stableReference(input.wardrobeSnapshotReference)
    || !OCCASIONS.has(input.occasion)
    || !SEASONS.has(input.seasonClass)
    || !WEATHER.has(input.weatherClass)
    || !DRESS_CODES.has(input.dressCode)
    || !AVAILABILITY.has(input.availabilityWindow)
    || !DESIRED_COUNTS.has(input.desiredCount)
  ) {
    return { ok: false, error: 'closed-minimized-request-envelope-required' };
  }

  return {
    ok: true,
    result: {
      schemaVersion: DAILY_STYLIST_PRODUCTION_BOUNDARY_VERSION,
      requestId: input.requestId,
      requestedAtIso: input.requestedAtIso,
      profileReference: input.profileReference,
      wardrobeSnapshotReference: input.wardrobeSnapshotReference,
      context: {
        occasion: input.occasion,
        seasonClass: input.seasonClass,
        weatherClass: input.weatherClass,
        dressCode: input.dressCode,
        availabilityWindow: input.availabilityWindow,
      },
      desiredCount: input.desiredCount,
      delegatesTo: {
        dailyOutfitIntentVersion: DAILY_OUTFIT_INTENT_VERSION,
        groundedDailyOutfitStylistVersion: GROUNDED_DAILY_OUTFIT_STYLIST_VERSION,
      },
      resolutionPlan: RESOLUTION_STEPS,
      policy: FIXED_POLICY,
    },
  };
}

export function serializeDailyStylistProductionPlan(result) {
  return stableSerialize(result);
}
