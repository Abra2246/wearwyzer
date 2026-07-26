import { stableSerialize } from './ai-stylist-evaluator.mjs';
import { DAILY_OUTFIT_INTENT_VERSION } from './daily-outfit-intent-contract.mjs';
import { OUTFIT_SET_RECOMMENDATION_VERSION } from './outfit-set-recommendation-contract.mjs';

export const GROUNDED_DAILY_OUTFIT_STYLIST_VERSION =
  'grounded-daily-outfit-stylist-v1';

const DAILY_KEYS = new Set([
  'schemaVersion',
  'requestId',
  'evidenceVersion',
  'status',
  'context',
  'reasonCodes',
  'outfitSet',
  'policy',
]);
const CONTEXT_KEYS = new Set([
  'occasion',
  'seasonClass',
  'weatherClass',
  'dressCode',
  'availabilityWindow',
]);
const DAILY_POLICY_KEYS = new Set([
  'explicitContextRequired',
  'uncertaintyMayBeInvented',
  'liveContextAccessAllowed',
  'commercialInfluenceAllowed',
  'externalActionsAllowed',
]);
const SET_KEYS = new Set([
  'schemaVersion',
  'requestId',
  'evidenceVersion',
  'intent',
  'desiredCount',
  'status',
  'selectedOutfitIds',
  'tiedOutfitIds',
  'qualifiedOutfitIds',
  'evaluations',
  'decisionReasonCodes',
  'policy',
]);
const EVALUATION_KEYS = new Set([
  'outfitId',
  'eligible',
  'status',
  'score',
  'evidenceCoverage',
  'confidence',
  'ownership',
  'formula',
  'reasonCodes',
  'compatibilityRef',
]);
const OWNERSHIP_KEYS = new Set(['owned', 'prospective', 'missing']);
const FORMULA_KEYS = new Set([
  'silhouette',
  'palette',
  'layering',
  'formality',
  'occasionExecution',
]);
const COMPATIBILITY_REF_KEYS = new Set([
  'schemaVersion',
  'evidenceVersion',
  'styleDnaVersion',
  'target',
]);
const TARGET_KEYS = new Set(['occasion', 'season']);
const SET_POLICY_KEYS = new Set([
  'minimumCompatibilityScore',
  'minimumEvidenceCoverage',
  'requiredConfidence',
  'ownedFirstWithinQualityBand',
  'duplicateFormulasAllowed',
  'exactTiesMayBeBroken',
  'commercialInfluenceAllowed',
  'externalActionsAllowed',
]);
const DAILY_STATUSES = new Set(['ready', 'review-required', 'abstained']);
const SET_STATUSES = new Set([
  'recommended-set',
  'tie-review',
  'insufficient-candidates',
  'none-qualified',
]);
const CONTEXT_VALUES = Object.freeze({
  occasion: new Set(['everyday', 'work', 'dinner', 'travel', 'weekend', 'event']),
  seasonClass: new Set(['warm', 'cold', 'transitional', 'unknown']),
  weatherClass: new Set(['dry', 'rain', 'heat', 'cold', 'variable', 'unknown']),
  dressCode: new Set(['casual', 'smart-casual', 'business-casual', 'formal', 'ambiguous']),
  availabilityWindow: new Set(['now', 'today', 'this-week', 'stale', 'unknown']),
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

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every(nonempty)
    && new Set(value).size === value.length;
}

function validScore(value) {
  return value === null
    || (Number.isInteger(value) && value >= 0 && value <= 100);
}

function validContext(context) {
  return exactKeys(context, CONTEXT_KEYS)
    && Object.entries(context).every(([key, value]) => CONTEXT_VALUES[key].has(value));
}

function validDailyPolicy(policy) {
  return exactKeys(policy, DAILY_POLICY_KEYS)
    && policy.explicitContextRequired === true
    && policy.uncertaintyMayBeInvented === false
    && policy.liveContextAccessAllowed === false
    && policy.commercialInfluenceAllowed === false
    && policy.externalActionsAllowed === false;
}

function validEvaluation(evaluation) {
  return exactKeys(evaluation, EVALUATION_KEYS)
    && nonempty(evaluation.outfitId)
    && typeof evaluation.eligible === 'boolean'
    && ['qualified', 'excluded'].includes(evaluation.status)
    && evaluation.eligible === (evaluation.status === 'qualified')
    && validScore(evaluation.score)
    && Number.isInteger(evaluation.evidenceCoverage)
    && evaluation.evidenceCoverage >= 0
    && evaluation.evidenceCoverage <= 100
    && ['high', 'moderate', 'low'].includes(evaluation.confidence)
    && exactKeys(evaluation.ownership, OWNERSHIP_KEYS)
    && Object.values(evaluation.ownership).every((value) => Number.isInteger(value) && value >= 0)
    && exactKeys(evaluation.formula, FORMULA_KEYS)
    && Object.values(evaluation.formula).every(nonempty)
    && uniqueStrings(evaluation.reasonCodes)
    && exactKeys(evaluation.compatibilityRef, COMPATIBILITY_REF_KEYS)
    && nonempty(evaluation.compatibilityRef.schemaVersion)
    && Number.isInteger(evaluation.compatibilityRef.evidenceVersion)
    && evaluation.compatibilityRef.evidenceVersion >= 1
    && nonempty(evaluation.compatibilityRef.styleDnaVersion)
    && exactKeys(evaluation.compatibilityRef.target, TARGET_KEYS)
    && Object.values(evaluation.compatibilityRef.target).every(nonempty);
}

function validSetPolicy(policy) {
  return exactKeys(policy, SET_POLICY_KEYS)
    && Number.isInteger(policy.minimumCompatibilityScore)
    && Number.isInteger(policy.minimumEvidenceCoverage)
    && policy.requiredConfidence === 'high'
    && policy.ownedFirstWithinQualityBand === true
    && policy.duplicateFormulasAllowed === false
    && policy.exactTiesMayBeBroken === false
    && policy.commercialInfluenceAllowed === false
    && policy.externalActionsAllowed === false;
}

function everyIdExists(ids, evaluations) {
  const known = new Set(evaluations.map(({ outfitId }) => outfitId));
  return ids.every((id) => known.has(id));
}

function validOutfitSet(set, daily) {
  if (!exactKeys(set, SET_KEYS)
    || set.schemaVersion !== OUTFIT_SET_RECOMMENDATION_VERSION
    || set.requestId !== `${daily.requestId}:outfit-set`
    || set.evidenceVersion !== daily.evidenceVersion
    || set.intent !== daily.context.occasion
    || ![2, 3].includes(set.desiredCount)
    || !SET_STATUSES.has(set.status)
    || !uniqueStrings(set.selectedOutfitIds)
    || !uniqueStrings(set.tiedOutfitIds)
    || !uniqueStrings(set.qualifiedOutfitIds)
    || !Array.isArray(set.evaluations)
    || set.evaluations.length < 2
    || set.evaluations.length > 8
    || !set.evaluations.every(validEvaluation)
    || new Set(set.evaluations.map(({ outfitId }) => outfitId)).size !== set.evaluations.length
    || !everyIdExists(set.selectedOutfitIds, set.evaluations)
    || !everyIdExists(set.tiedOutfitIds, set.evaluations)
    || !everyIdExists(set.qualifiedOutfitIds, set.evaluations)
    || set.selectedOutfitIds.some((id) => set.tiedOutfitIds.includes(id))
    || !uniqueStrings(set.decisionReasonCodes)
    || !validSetPolicy(set.policy)) {
    return false;
  }
  if (set.status === 'recommended-set') {
    return set.selectedOutfitIds.length === set.desiredCount
      && set.tiedOutfitIds.length === 0;
  }
  if (set.status === 'tie-review') {
    return set.tiedOutfitIds.length > 1
      && set.selectedOutfitIds.length < set.desiredCount;
  }
  return set.selectedOutfitIds.length === 0
    && set.tiedOutfitIds.length === 0;
}

export function validateDailyOutfitIntentResult(result) {
  if (!exactKeys(result, DAILY_KEYS)
    || result.schemaVersion !== DAILY_OUTFIT_INTENT_VERSION
    || !nonempty(result.requestId)
    || !Number.isInteger(result.evidenceVersion)
    || result.evidenceVersion < 1
    || !DAILY_STATUSES.has(result.status)
    || !validContext(result.context)
    || !uniqueStrings(result.reasonCodes)
    || !validDailyPolicy(result.policy)
    || !(result.outfitSet === null || validOutfitSet(result.outfitSet, result))) {
    return false;
  }
  if (result.status === 'ready') {
    return result.outfitSet?.status === 'recommended-set';
  }
  if (result.status === 'review-required') {
    return result.outfitSet === null || result.outfitSet.status === 'tie-review';
  }
  return result.outfitSet === null
    || ['insufficient-candidates', 'none-qualified'].includes(result.outfitSet.status);
}

function citationCatalog(result) {
  const citations = [{
    citationId: `daily-outfit:${result.requestId}:v${result.evidenceVersion}`,
    type: 'daily-outfit-intent',
    schemaVersion: result.schemaVersion,
    requestId: result.requestId,
    evidenceVersion: result.evidenceVersion,
    state: 'accepted',
  }];
  if (result.outfitSet) {
    citations.push({
      citationId: `outfit-set:${result.outfitSet.requestId}:v${result.outfitSet.evidenceVersion}`,
      type: 'outfit-set-recommendation',
      schemaVersion: result.outfitSet.schemaVersion,
      requestId: result.outfitSet.requestId,
      evidenceVersion: result.outfitSet.evidenceVersion,
      state: 'accepted',
    });
  }
  return citations;
}

function projectEvaluation(evaluation, set) {
  return {
    outfitId: evaluation.outfitId,
    status: evaluation.status,
    selected: set.selectedOutfitIds.includes(evaluation.outfitId),
    tied: set.tiedOutfitIds.includes(evaluation.outfitId),
    qualified: set.qualifiedOutfitIds.includes(evaluation.outfitId),
    score: evaluation.score,
    evidenceCoverage: evaluation.evidenceCoverage,
    confidence: evaluation.confidence,
    reasonCodes: [...evaluation.reasonCodes],
    compatibilityRef: structuredClone(evaluation.compatibilityRef),
  };
}

function nextStep(result) {
  if (result.status === 'ready') return 'review-selected-outfit-options';
  if (result.outfitSet?.status === 'tie-review') return 'review-tied-outfits';
  if (result.outfitSet?.status === 'insufficient-candidates') {
    return 'confirm-more-current-available-outfits';
  }
  if (result.outfitSet?.status === 'none-qualified') return 'review-outfit-evidence';
  if (result.status === 'review-required') return 'confirm-explicit-context';
  return 'resolve-context-conflict';
}

function copyFor(result) {
  if (result.status === 'ready') {
    const count = result.outfitSet.selectedOutfitIds.length;
    return {
      title: 'Your daily outfit options are ready.',
      summary: `${count} trusted outfit ${count === 1 ? 'option is' : 'options are'} ready for ${result.context.occasion}.`,
    };
  }
  if (result.status === 'review-required') {
    return {
      title: 'More context is needed.',
      summary: 'WearWyzer will not recommend a daily outfit until the unresolved evidence is reviewed.',
    };
  }
  return {
    title: 'No trustworthy daily outfit recommendation is available.',
    summary: 'WearWyzer abstained instead of guessing from conflicting or insufficient evidence.',
  };
}

function uncertainty(result) {
  if (result.status !== 'ready') {
    return {
      value: 1,
      level: 'high',
      reasonCodes: [...result.reasonCodes],
    };
  }
  const selected = result.outfitSet.evaluations.filter(
    ({ outfitId }) => result.outfitSet.selectedOutfitIds.includes(outfitId),
  );
  const minimumCoverage = Math.min(...selected.map(({ evidenceCoverage }) => evidenceCoverage));
  return {
    value: Number((1 - (minimumCoverage / 100)).toFixed(2)),
    level: minimumCoverage >= 90 ? 'low' : 'moderate',
    reasonCodes: ['accepted-daily-outfit-and-outfit-set-evidence'],
  };
}

export function adaptDailyOutfitStylistResponse(result) {
  if (!validateDailyOutfitIntentResult(result)) {
    return { ok: false, error: 'valid-daily-outfit-intent-result-required' };
  }
  const copy = copyFor(result);
  const set = result.outfitSet;
  return {
    ok: true,
    response: {
      schemaVersion: GROUNDED_DAILY_OUTFIT_STYLIST_VERSION,
      requestId: result.requestId,
      evidenceVersion: result.evidenceVersion,
      intent: 'daily-outfit',
      outcome: result.status === 'ready'
        ? 'answer'
        : result.status === 'review-required'
          ? 'review-required'
          : 'abstain',
      title: copy.title,
      summary: copy.summary,
      context: structuredClone(result.context),
      selectedOutfitIds: [...(set?.selectedOutfitIds ?? [])],
      tiedOutfitIds: [...(set?.tiedOutfitIds ?? [])],
      qualifiedOutfitIds: [...(set?.qualifiedOutfitIds ?? [])],
      reasonCodes: [...result.reasonCodes],
      uncertainty: uncertainty(result),
      citations: citationCatalog(result),
      outfitEvidence: set
        ? set.evaluations.map((evaluation) => projectEvaluation(evaluation, set))
        : [],
      limitations: [
        'fixture-only',
        'minimized-evidence-only',
        'no-live-context-access',
        'no-external-actions',
      ],
      nextStep: nextStep(result),
      policy: {
        sourceRankingReused: true,
        providerCallsAllowed: false,
        liveContextAccessAllowed: false,
        commercialInfluenceAllowed: false,
        externalActionsAllowed: false,
      },
    },
  };
}

export function serializeGroundedDailyOutfitStylistResponse(response) {
  return stableSerialize(response);
}
