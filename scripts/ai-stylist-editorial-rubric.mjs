import {
  STYLIST_REPLAY_REPORT_VERSION,
} from './ai-stylist-replay-gate.mjs';
import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const EDITORIAL_RUBRIC_VERSION = 'ai-stylist-editorial-rubric-v1';
export const EDITORIAL_DIMENSIONS = Object.freeze([
  'usefulness',
  'clarity',
  'stylingQuality',
  'wearWyzerVoice',
  'actionability',
]);
export const EDITORIAL_SCORE_ANCHORS = Object.freeze({
  1: 'Actively unhelpful, confusing, off-brand, or unusable.',
  2: 'Major editorial weaknesses; substantial revision required.',
  3: 'Adequate and usable, with clear opportunities to improve.',
  4: 'Strong, specific, clear, and recognizably WearWyzer.',
  5: 'Exceptional editorial value with no material revision needed.',
});

const REVIEW_KEYS = new Set([
  'schemaVersion',
  'reviewId',
  'reviewerAlias',
  'candidateId',
  'scores',
]);
const SCORE_KEYS = new Set(['score', 'rationale']);
const SENSITIVE_TEXT = /(?:private prompt|raw wardrobe|api[_ -]?key|bearer\s+|sk-[a-z0-9]|gh[pousr]_|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;

function closedObject(value, allowedKeys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowedKeys.has(key));
}

function validateTrustReport(report) {
  if (!report || report.schemaVersion !== STYLIST_REPLAY_REPORT_VERSION) {
    return 'trusted-replay-report-required';
  }
  if (!report.passed
    || report.missingIntents?.length
    || report.failedScenarioIds?.length
    || report.thresholdFailures?.length
    || Object.values(report.metrics ?? {}).some((score) => score !== 1)) {
    return 'candidate-must-pass-all-trust-thresholds';
  }
  return null;
}

function validateReview(review, trustedCandidateIds) {
  if (!closedObject(review, REVIEW_KEYS)) return 'editorial-review-closed-schema-required';
  if (review.schemaVersion !== EDITORIAL_RUBRIC_VERSION) return 'unsupported-rubric-version';
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(review.reviewId ?? '')) return 'valid-review-id-required';
  if (!/^fixture-editor-[a-z0-9-]{2,48}$/.test(review.reviewerAlias ?? '')) {
    return 'synthetic-reviewer-alias-required';
  }
  if (!trustedCandidateIds.has(review.candidateId)) return 'trusted-candidate-required';
  if (!closedObject(review.scores, new Set(EDITORIAL_DIMENSIONS))
    || Object.keys(review.scores).length !== EDITORIAL_DIMENSIONS.length) {
    return 'complete-editorial-dimensions-required';
  }
  for (const dimension of EDITORIAL_DIMENSIONS) {
    const item = review.scores[dimension];
    if (!closedObject(item, SCORE_KEYS)) return 'editorial-score-closed-schema-required';
    if (!Number.isInteger(item.score) || item.score < 1 || item.score > 5) {
      return 'editorial-score-must-be-one-to-five';
    }
    if (typeof item.rationale !== 'string'
      || item.rationale.trim().length < 10
      || item.rationale.length > 400) {
      return 'editorial-rationale-required';
    }
    if (SENSITIVE_TEXT.test(item.rationale)) return 'sensitive-editorial-rationale-rejected';
  }
  return null;
}

function summarizeCandidate(candidateId, reviews) {
  const dimensions = {};
  const disagreementDimensions = [];
  for (const dimension of EDITORIAL_DIMENSIONS) {
    const entries = reviews.map((review) => ({
      score: review.scores[dimension].score,
      rationale: review.scores[dimension].rationale.trim(),
    }));
    const scores = entries.map(({ score }) => score);
    const average = scores.length
      ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
      : null;
    const range = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
    if (range >= 2) disagreementDimensions.push(dimension);
    dimensions[dimension] = { average, entries };
  }
  const overallScore = reviews.length
    ? Number((
      EDITORIAL_DIMENSIONS.reduce((sum, dimension) => sum + dimensions[dimension].average, 0)
        / EDITORIAL_DIMENSIONS.length
    ).toFixed(2))
    : null;
  return {
    candidateId,
    dimensions,
    overallScore,
    disagreement: {
      present: disagreementDimensions.length > 0,
      dimensions: disagreementDimensions,
    },
  };
}

export function aggregateEditorialReviews(trustReports, reviews) {
  if (!Array.isArray(trustReports) || trustReports.length === 0) {
    return { ok: false, error: 'trust-reports-required' };
  }
  const reportIds = trustReports.map((report) => report?.candidateId);
  if (new Set(reportIds).size !== reportIds.length) {
    return { ok: false, error: 'duplicate-trusted-candidate' };
  }
  for (const report of trustReports) {
    const error = validateTrustReport(report);
    if (error) return { ok: false, error, candidateId: report?.candidateId ?? null };
  }
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { ok: false, error: 'editorial-reviews-required' };
  }
  const trustedCandidateIds = new Set(reportIds);
  const reviewIds = reviews.map((review) => review?.reviewId);
  if (new Set(reviewIds).size !== reviewIds.length) {
    return { ok: false, error: 'duplicate-editorial-review' };
  }
  for (const review of reviews) {
    const error = validateReview(review, trustedCandidateIds);
    if (error) return { ok: false, error, reviewId: review?.reviewId ?? null };
  }
  const reviewCounts = new Map(
    reportIds.map((candidateId) => [
      candidateId,
      reviews.filter((review) => review.candidateId === candidateId).length,
    ]),
  );
  const summaries = [...reportIds].sort().map((candidateId) => summarizeCandidate(
    candidateId,
    reviews.filter((review) => review.candidateId === candidateId),
  ));
  if (summaries.some(({ candidateId }) => reviewCounts.get(candidateId) < 2)) {
    return {
      ok: true,
      report: {
        rubricVersion: EDITORIAL_RUBRIC_VERSION,
        candidates: summaries,
        disagreement: summaries.filter((summary) => summary.disagreement.present),
        decision: { status: 'needs-more-reviews', selectedCandidateIds: [] },
      },
    };
  }
  if (summaries.some(({ disagreement }) => disagreement.present)) {
    return {
      ok: true,
      report: {
        rubricVersion: EDITORIAL_RUBRIC_VERSION,
        candidates: summaries,
        disagreement: summaries.filter((summary) => summary.disagreement.present),
        decision: { status: 'review-required', selectedCandidateIds: [] },
      },
    };
  }
  const topScore = Math.max(...summaries.map(({ overallScore }) => overallScore));
  const topIds = summaries
    .filter(({ overallScore }) => overallScore === topScore)
    .map(({ candidateId }) => candidateId);
  return {
    ok: true,
    report: {
      rubricVersion: EDITORIAL_RUBRIC_VERSION,
      candidates: summaries,
      disagreement: [],
      decision: {
        status: topIds.length === 1 ? 'selected' : 'tie',
        selectedCandidateIds: topIds,
      },
    },
  };
}

export function serializeEditorialReport(report) {
  return stableSerialize(report);
}
