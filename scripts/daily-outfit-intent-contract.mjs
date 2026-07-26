import { stableSerialize } from './ai-stylist-evaluator.mjs';
import { recommendOutfitSet } from './outfit-set-recommendation-contract.mjs';

export const DAILY_OUTFIT_INTENT_VERSION = 'daily-outfit-intent-v1';

const INPUT_KEYS = new Set([
  'requestId',
  'evidenceVersion',
  'occasion',
  'seasonClass',
  'weatherClass',
  'dressCode',
  'availabilityWindow',
  'desiredCount',
  'candidates',
]);
const OCCASIONS = new Set(['everyday', 'work', 'dinner', 'travel', 'weekend', 'event']);
const SEASONS = new Set(['warm', 'cold', 'transitional', 'unknown']);
const WEATHER = new Set(['dry', 'rain', 'heat', 'cold', 'variable', 'unknown']);
const DRESS_CODES = new Set(['casual', 'smart-casual', 'business-casual', 'formal', 'ambiguous']);
const AVAILABILITY = new Set(['now', 'today', 'this-week', 'stale', 'unknown']);
const DESIRED_COUNTS = new Set([2, 3]);

// Exposed so other accepted boundaries (e.g. the production data boundary in
// docs/DAILY_STYLIST_PRODUCTION_BOUNDARY_V1.md) can reuse the exact allowlists
// by reference instead of recreating context validation.
export const DAILY_OUTFIT_CONTEXT_ALLOWLISTS = Object.freeze({
  occasions: Object.freeze([...OCCASIONS]),
  seasonClasses: Object.freeze([...SEASONS]),
  weatherClasses: Object.freeze([...WEATHER]),
  dressCodes: Object.freeze([...DRESS_CODES]),
  availabilityWindows: Object.freeze([...AVAILABILITY]),
  desiredCounts: Object.freeze([...DESIRED_COUNTS]),
});

function exactKeys(value, keys) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function contextReasons(input) {
  const review = [];
  const conflicts = [];
  if (input.seasonClass === 'unknown') review.push('season-class-unknown');
  if (input.weatherClass === 'unknown') review.push('weather-class-unknown');
  if (input.dressCode === 'ambiguous') review.push('dress-code-ambiguous');
  if (input.availabilityWindow === 'unknown') review.push('availability-unknown');
  if (input.availabilityWindow === 'stale') review.push('availability-evidence-stale');
  if (input.seasonClass === 'warm' && input.weatherClass === 'cold') {
    conflicts.push('warm-season-conflicts-with-cold-weather');
  }
  if (input.seasonClass === 'cold' && input.weatherClass === 'heat') {
    conflicts.push('cold-season-conflicts-with-heat-weather');
  }
  if (input.dressCode === 'formal' && !['dinner', 'event'].includes(input.occasion)) {
    conflicts.push('formal-dress-code-conflicts-with-occasion');
  }
  if (input.dressCode === 'business-casual' && !['work', 'event'].includes(input.occasion)) {
    conflicts.push('business-casual-conflicts-with-occasion');
  }
  return { review: review.sort(), conflicts: conflicts.sort() };
}

export function evaluateDailyOutfitIntent(input) {
  if (!exactKeys(input, INPUT_KEYS)
    || !nonempty(input.requestId)
    || !Number.isInteger(input.evidenceVersion)
    || input.evidenceVersion < 1
    || !OCCASIONS.has(input.occasion)
    || !SEASONS.has(input.seasonClass)
    || !WEATHER.has(input.weatherClass)
    || !DRESS_CODES.has(input.dressCode)
    || !AVAILABILITY.has(input.availabilityWindow)
    || !DESIRED_COUNTS.has(input.desiredCount)
    || !Array.isArray(input.candidates)) {
    return { ok: false, error: 'valid-minimized-daily-outfit-intent-required' };
  }

  const reasons = contextReasons(input);
  const context = {
    occasion: input.occasion,
    seasonClass: input.seasonClass,
    weatherClass: input.weatherClass,
    dressCode: input.dressCode,
    availabilityWindow: input.availabilityWindow,
  };
  if (reasons.conflicts.length) {
    return {
      ok: true,
      result: {
        schemaVersion: DAILY_OUTFIT_INTENT_VERSION,
        requestId: input.requestId,
        evidenceVersion: input.evidenceVersion,
        status: 'abstained',
        context,
        reasonCodes: reasons.conflicts,
        outfitSet: null,
        policy: {
          explicitContextRequired: true,
          uncertaintyMayBeInvented: false,
          liveContextAccessAllowed: false,
          commercialInfluenceAllowed: false,
          externalActionsAllowed: false,
        },
      },
    };
  }
  if (reasons.review.length) {
    return {
      ok: true,
      result: {
        schemaVersion: DAILY_OUTFIT_INTENT_VERSION,
        requestId: input.requestId,
        evidenceVersion: input.evidenceVersion,
        status: 'review-required',
        context,
        reasonCodes: reasons.review,
        outfitSet: null,
        policy: {
          explicitContextRequired: true,
          uncertaintyMayBeInvented: false,
          liveContextAccessAllowed: false,
          commercialInfluenceAllowed: false,
          externalActionsAllowed: false,
        },
      },
    };
  }

  const set = recommendOutfitSet({
    requestId: `${input.requestId}:outfit-set`,
    evidenceVersion: input.evidenceVersion,
    intent: input.occasion,
    desiredCount: input.desiredCount,
    candidates: input.candidates,
  });
  if (!set.ok) {
    return { ok: false, error: 'valid-minimized-outfit-candidates-required' };
  }
  const status = set.result.status === 'recommended-set'
    ? 'ready'
    : set.result.status === 'tie-review'
      ? 'review-required'
      : 'abstained';
  return {
    ok: true,
    result: {
      schemaVersion: DAILY_OUTFIT_INTENT_VERSION,
      requestId: input.requestId,
      evidenceVersion: input.evidenceVersion,
      status,
      context,
      reasonCodes: [
        `outfit-set-${set.result.status}`,
        ...(status === 'ready' ? ['explicit-context-and-outfit-set-qualified'] : []),
      ].sort(),
      outfitSet: structuredClone(set.result),
      policy: {
        explicitContextRequired: true,
        uncertaintyMayBeInvented: false,
        liveContextAccessAllowed: false,
        commercialInfluenceAllowed: false,
        externalActionsAllowed: false,
      },
    },
  };
}

export function serializeDailyOutfitIntent(result) {
  return stableSerialize(result);
}
