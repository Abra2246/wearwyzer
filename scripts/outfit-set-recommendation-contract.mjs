import { stableSerialize } from './ai-stylist-evaluator.mjs';
import { OUTFIT_COMPATIBILITY_VERSION } from './outfit-compatibility-contract.mjs';

export const OUTFIT_SET_RECOMMENDATION_VERSION = 'outfit-set-recommendation-v1';

const MIN_SCORE = 70;
const MIN_COVERAGE = 75;
const INPUT_KEYS = new Set([
  'requestId',
  'evidenceVersion',
  'intent',
  'desiredCount',
  'candidates',
]);
const CANDIDATE_KEYS = new Set(['candidateId', 'compatibility', 'formula']);
const FORMULA_KEYS = new Set([
  'silhouette',
  'palette',
  'layering',
  'formality',
  'occasionExecution',
]);
const COMPATIBILITY_KEYS = new Set([
  'schemaVersion',
  'outfitId',
  'evidenceVersion',
  'styleDnaVersion',
  'status',
  'score',
  'evidenceCoverage',
  'confidence',
  'target',
  'parts',
  'hardIncompatibilities',
  'missingEvidence',
  'reasonCodes',
  'items',
  'policy',
]);
const TARGET_KEYS = new Set(['occasion', 'season']);
const PART_KEYS = new Set([
  'palette',
  'silhouette',
  'formality',
  'material',
  'occasion',
  'layering',
  'verifiedFit',
  'ownedPairing',
]);
const ITEM_KEYS = new Set([
  'itemId',
  'productId',
  'ownership',
  'role',
  'evidenceState',
  'fitStatus',
]);
const POLICY_KEYS = new Set([
  'explicitNegativeSignalsMayBlock',
  'inferredNegativeSignalsMayBlock',
  'missingEvidenceLowersConfidence',
  'fitAndProductTruthOutrankPreference',
  'commercialInfluenceAllowed',
]);
const INTENTS = new Set(['everyday', 'work', 'dinner', 'travel', 'weekend', 'event']);
const STATUSES = new Set(['compatible', 'review-required', 'incompatible', 'insufficient-evidence']);
const CONFIDENCE = new Set(['high', 'moderate', 'low']);
const OWNERSHIP = new Set(['owned', 'prospective', 'missing']);
const ROLES = new Set(['top', 'bottom', 'footwear', 'outerwear', 'accessory']);
const EVIDENCE_STATES = new Set(['current', 'stale', 'unknown']);
const FIT_STATUSES = new Set(['verified', 'unknown', 'not-applicable', 'conflicting']);

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

function validCompatibilityItem(item) {
  return exactKeys(item, ITEM_KEYS)
    && nonempty(item.itemId)
    && nonempty(item.productId)
    && OWNERSHIP.has(item.ownership)
    && ROLES.has(item.role)
    && EVIDENCE_STATES.has(item.evidenceState)
    && FIT_STATUSES.has(item.fitStatus);
}

function validCompatibility(result) {
  return exactKeys(result, COMPATIBILITY_KEYS)
    && result.schemaVersion === OUTFIT_COMPATIBILITY_VERSION
    && nonempty(result.outfitId)
    && Number.isInteger(result.evidenceVersion)
    && result.evidenceVersion >= 1
    && nonempty(result.styleDnaVersion)
    && STATUSES.has(result.status)
    && validScore(result.score)
    && Number.isInteger(result.evidenceCoverage)
    && result.evidenceCoverage >= 0
    && result.evidenceCoverage <= 100
    && CONFIDENCE.has(result.confidence)
    && exactKeys(result.target, TARGET_KEYS)
    && nonempty(result.target.occasion)
    && nonempty(result.target.season)
    && exactKeys(result.parts, PART_KEYS)
    && Object.values(result.parts).every(validScore)
    && uniqueStrings(result.hardIncompatibilities)
    && uniqueStrings(result.missingEvidence)
    && uniqueStrings(result.reasonCodes)
    && Array.isArray(result.items)
    && result.items.length >= 3
    && result.items.length <= 5
    && result.items.every(validCompatibilityItem)
    && new Set(result.items.map(({ itemId }) => itemId)).size === result.items.length
    && exactKeys(result.policy, POLICY_KEYS)
    && result.policy.explicitNegativeSignalsMayBlock === true
    && result.policy.inferredNegativeSignalsMayBlock === false
    && result.policy.missingEvidenceLowersConfidence === true
    && result.policy.fitAndProductTruthOutrankPreference === true
    && result.policy.commercialInfluenceAllowed === false;
}

function validCandidate(candidate) {
  return exactKeys(candidate, CANDIDATE_KEYS)
    && nonempty(candidate.candidateId)
    && validCompatibility(candidate.compatibility)
    && candidate.candidateId === candidate.compatibility.outfitId
    && exactKeys(candidate.formula, FORMULA_KEYS)
    && Object.values(candidate.formula).every(nonempty);
}

function formulaSignature(formula) {
  return Object.values(formula).map((value) => value.trim().toLowerCase()).join('\u0000');
}

function ownershipCounts(items) {
  return {
    owned: items.filter(({ ownership }) => ownership === 'owned').length,
    prospective: items.filter(({ ownership }) => ownership === 'prospective').length,
    missing: items.filter(({ ownership }) => ownership === 'missing').length,
  };
}

function qualificationReasons(compatibility, intent) {
  const reasons = [];
  if (compatibility.status !== 'compatible') {
    reasons.push(`compatibility-status-${compatibility.status}`);
  }
  if (!Number.isFinite(compatibility.score) || compatibility.score < MIN_SCORE) {
    reasons.push('compatibility-score-below-threshold');
  }
  if (compatibility.evidenceCoverage < MIN_COVERAGE) {
    reasons.push('evidence-coverage-below-threshold');
  }
  if (compatibility.confidence !== 'high') {
    reasons.push('confidence-below-threshold');
  }
  if (compatibility.hardIncompatibilities.length) {
    reasons.push('hard-incompatibility-present');
  }
  if (compatibility.missingEvidence.length) {
    reasons.push('missing-evidence-present');
  }
  if (compatibility.target.occasion !== intent) {
    reasons.push('intent-does-not-match-compatibility-target');
  }
  if (compatibility.items.some(({ evidenceState }) => evidenceState !== 'current')) {
    reasons.push('product-evidence-not-current');
  }
  if (compatibility.items.some(({ fitStatus }) => ['unknown', 'conflicting'].includes(fitStatus))) {
    reasons.push('fit-evidence-unresolved');
  }
  if (compatibility.items.some(({ ownership }) => ownership === 'missing')) {
    reasons.push('missing-item-present');
  }
  return [...new Set(reasons)].sort();
}

function rankTuple(evaluation) {
  return [
    Math.floor(evaluation.score / 5),
    evaluation.ownership.owned,
    evaluation.score,
  ];
}

function sameRank(left, right) {
  return rankTuple(left).every((value, index) => value === rankTuple(right)[index]);
}

function rankEvaluations(left, right) {
  const leftRank = rankTuple(left);
  const rightRank = rankTuple(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return rightRank[index] - leftRank[index];
  }
  return left.outfitId.localeCompare(right.outfitId);
}

function minimizedEvaluation(candidate, duplicateFormula) {
  const { compatibility, formula } = candidate;
  const ownership = ownershipCounts(compatibility.items);
  const exclusionReasons = qualificationReasons(compatibility, compatibility.target.occasion);
  if (duplicateFormula) exclusionReasons.push('duplicate-outfit-formula');
  const eligible = exclusionReasons.length === 0;
  const reasonCodes = eligible
    ? [
      'compatibility-gate-passed',
      ownership.prospective === 0 ? 'fully-owned-outfit' : 'owned-first-outfit',
      'distinct-outfit-formula',
    ]
    : exclusionReasons;
  return {
    outfitId: compatibility.outfitId,
    eligible,
    status: eligible ? 'qualified' : 'excluded',
    score: compatibility.score,
    evidenceCoverage: compatibility.evidenceCoverage,
    confidence: compatibility.confidence,
    ownership,
    formula: { ...formula },
    reasonCodes: [...new Set(reasonCodes)].sort(),
    compatibilityRef: {
      schemaVersion: compatibility.schemaVersion,
      evidenceVersion: compatibility.evidenceVersion,
      styleDnaVersion: compatibility.styleDnaVersion,
      target: { ...compatibility.target },
    },
  };
}

export function recommendOutfitSet(input) {
  if (!exactKeys(input, INPUT_KEYS)
    || !nonempty(input.requestId)
    || !Number.isInteger(input.evidenceVersion)
    || input.evidenceVersion < 1
    || !INTENTS.has(input.intent)
    || ![2, 3].includes(input.desiredCount)
    || !Array.isArray(input.candidates)
    || input.candidates.length < 2
    || input.candidates.length > 8
    || !input.candidates.every(validCandidate)
    || new Set(input.candidates.map(({ candidateId }) => candidateId)).size
      !== input.candidates.length
    || input.candidates.some(({ compatibility }) => (
      compatibility.evidenceVersion !== input.evidenceVersion
      || compatibility.target.occasion !== input.intent
    ))) {
    return { ok: false, error: 'valid-minimized-outfit-set-request-required' };
  }

  const signatureCounts = new Map();
  for (const { formula } of input.candidates) {
    const signature = formulaSignature(formula);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  }
  const evaluations = input.candidates
    .map((candidate) => minimizedEvaluation(
      candidate,
      signatureCounts.get(formulaSignature(candidate.formula)) > 1,
    ))
    .sort((left, right) => left.outfitId.localeCompare(right.outfitId));
  const qualified = evaluations.filter(({ eligible }) => eligible).sort(rankEvaluations);

  let status = 'recommended-set';
  let selectedOutfitIds = [];
  let tiedOutfitIds = [];
  const decisionReasons = [];

  if (!qualified.length) {
    status = 'none-qualified';
    decisionReasons.push('no-outfit-passed-trust-and-diversity-gates');
  } else if (qualified.length < input.desiredCount) {
    status = 'insufficient-candidates';
    decisionReasons.push('fewer-qualified-outfits-than-requested');
  } else {
    const boundary = qualified[input.desiredCount - 1];
    const boundaryGroup = qualified.filter((evaluation) => sameRank(evaluation, boundary));
    const definite = qualified.filter(
      (evaluation) => rankEvaluations(evaluation, boundary) < 0
        && !sameRank(evaluation, boundary),
    );
    const slotsAtBoundary = input.desiredCount - definite.length;
    if (boundaryGroup.length > slotsAtBoundary) {
      status = 'tie-review';
      selectedOutfitIds = definite.map(({ outfitId }) => outfitId).sort();
      tiedOutfitIds = boundaryGroup.map(({ outfitId }) => outfitId).sort();
      decisionReasons.push('exact-ranking-tie-crosses-selection-boundary');
    } else {
      selectedOutfitIds = qualified
        .slice(0, input.desiredCount)
        .map(({ outfitId }) => outfitId)
        .sort();
      const selected = qualified.slice(0, input.desiredCount);
      const notSelected = qualified.slice(input.desiredCount);
      const ownedFirstPreferenceApplied = selected.some((selectedEvaluation) => (
        notSelected.some((alternative) => (
          Math.floor(alternative.score / 5) === Math.floor(selectedEvaluation.score / 5)
          && alternative.score > selectedEvaluation.score
          && selectedEvaluation.ownership.owned > alternative.ownership.owned
        ))
      ));
      if (ownedFirstPreferenceApplied) {
        decisionReasons.push('owned-first-preference-within-quality-band');
      }
      decisionReasons.push('qualified-distinct-outfit-set');
    }
  }

  return {
    ok: true,
    result: {
      schemaVersion: OUTFIT_SET_RECOMMENDATION_VERSION,
      requestId: input.requestId,
      evidenceVersion: input.evidenceVersion,
      intent: input.intent,
      desiredCount: input.desiredCount,
      status,
      selectedOutfitIds,
      tiedOutfitIds,
      qualifiedOutfitIds: qualified.map(({ outfitId }) => outfitId).sort(),
      evaluations,
      decisionReasonCodes: decisionReasons.sort(),
      policy: {
        minimumCompatibilityScore: MIN_SCORE,
        minimumEvidenceCoverage: MIN_COVERAGE,
        requiredConfidence: 'high',
        ownedFirstWithinQualityBand: true,
        duplicateFormulasAllowed: false,
        exactTiesMayBeBroken: false,
        commercialInfluenceAllowed: false,
        externalActionsAllowed: false,
      },
    },
  };
}

export function serializeOutfitSetRecommendation(result) {
  return stableSerialize(result);
}
