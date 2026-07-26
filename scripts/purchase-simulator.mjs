import { evaluatePurchase } from './personalization-engine.mjs';
import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const PURCHASE_SIMULATOR_VERSION = 'purchase-simulator-v1';
const MAX_SOURCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function sourceState(candidate, nowIso) {
  const verifiedAt = Date.parse(candidate.sourceVerifiedAt ?? '');
  const now = Date.parse(nowIso ?? '');
  if (!Number.isFinite(now)) return { eligible: false, reason: 'valid-now-required' };
  if (!Number.isFinite(verifiedAt)) return { eligible: false, reason: 'source-unverified' };
  if (verifiedAt > now || now - verifiedAt > MAX_SOURCE_AGE_MS) {
    return { eligible: false, reason: 'source-stale' };
  }
  if (candidate.availabilityStatus !== 'available') {
    return { eligible: false, reason: `availability-${candidate.availabilityStatus}` };
  }
  return { eligible: true, reason: 'current-and-available' };
}

function minimizedEvaluation(result, nowIso) {
  if (!result.ok) {
    return {
      candidateId: result.candidate?.productId ?? null,
      eligible: false,
      status: result.error,
      scores: null,
      supportingEvidence: [],
      opposingEvidence: [...(result.reasonCodes ?? [])],
      source: null,
    };
  }
  const source = sourceState(result.candidate, nowIso);
  const qualityEligible = result.recommendation === 'buy' && result.confidence !== 'low';
  return {
    candidateId: result.candidate.productId,
    eligible: source.eligible && qualityEligible,
    status: !source.eligible
      ? source.reason
      : qualityEligible ? 'qualified' : `recommendation-${result.recommendation}`,
    scores: {
      compatibility: result.scores.compatibility.score,
      versatility: result.scores.versatility,
      gapCoverage: result.scores.gapCoverage.score,
      redundancy: result.scores.redundancy.score,
      outfitUnlocks: result.scores.outfitUnlocks,
      purchaseRoi: result.scores.purchaseRoi,
    },
    supportingEvidence: [...result.supportingEvidence],
    opposingEvidence: [...result.opposingEvidence],
    source: {
      verifiedAt: result.candidate.sourceVerifiedAt,
      availabilityStatus: result.candidate.availabilityStatus,
      priceStatus: result.candidate.priceStatus,
    },
  };
}

export function compareProspectivePurchases({
  profile,
  wardrobe,
  candidateIds,
  nowIso,
  catalog,
  offers,
  facts,
}) {
  if (!Array.isArray(candidateIds)
    || candidateIds.length < 2
    || candidateIds.length > 3
    || candidateIds.some((candidateId) => typeof candidateId !== 'string' || !candidateId)
    || new Set(candidateIds).size !== candidateIds.length) {
    return { ok: false, error: 'two-or-three-unique-candidates-required' };
  }
  if (!Number.isFinite(Date.parse(nowIso ?? ''))) {
    return { ok: false, error: 'valid-now-required' };
  }
  const evaluations = candidateIds.map((candidateId) => evaluatePurchase({
    profile,
    wardrobe,
    candidateId,
    ...(catalog ? { catalog } : {}),
    ...(offers ? { offers } : {}),
    ...(facts ? { facts } : {}),
  }));
  const candidates = evaluations.map((result, index) => {
    const minimized = minimizedEvaluation(result, nowIso);
    return minimized.candidateId ? minimized : { ...minimized, candidateId: candidateIds[index] };
  });
  const eligible = candidates.filter((candidate) => candidate.eligible);
  if (eligible.length === 0) {
    return {
      ok: true,
      comparison: {
        schemaVersion: PURCHASE_SIMULATOR_VERSION,
        candidates,
        decision: {
          status: 'buy-none',
          selectedCandidateIds: [],
          reasonCodes: ['no-candidate-passed-quality-and-evidence-gates'],
        },
      },
    };
  }
  const topRoi = Math.max(...eligible.map((candidate) => candidate.scores.purchaseRoi));
  const leaders = eligible
    .filter((candidate) => candidate.scores.purchaseRoi === topRoi)
    .map((candidate) => candidate.candidateId)
    .sort();
  return {
    ok: true,
    comparison: {
      schemaVersion: PURCHASE_SIMULATOR_VERSION,
      candidates,
      decision: {
        status: leaders.length === 1 ? 'selected' : 'tie',
        selectedCandidateIds: leaders,
        reasonCodes: leaders.length === 1
          ? ['highest-qualified-purchase-roi']
          : ['equal-qualified-purchase-roi'],
      },
    },
  };
}

export function serializePurchaseComparison(comparison) {
  return stableSerialize(comparison);
}
