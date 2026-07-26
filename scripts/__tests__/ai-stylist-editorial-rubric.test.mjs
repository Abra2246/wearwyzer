import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateEditorialReviews,
  EDITORIAL_DIMENSIONS,
  EDITORIAL_RUBRIC_VERSION,
  EDITORIAL_SCORE_ANCHORS,
  serializeEditorialReport,
} from '../ai-stylist-editorial-rubric.mjs';
import {
  createTrustedFixtureCandidate,
  replayStylistCandidate,
} from '../ai-stylist-replay-gate.mjs';

function trustReport(id) {
  return replayStylistCandidate(createTrustedFixtureCandidate({
    candidateId: id,
    providerAlias: `fixture-${id}`,
  })).report;
}

function review(candidateId, reviewer, score = 4) {
  return {
    schemaVersion: EDITORIAL_RUBRIC_VERSION,
    reviewId: `${candidateId}-${reviewer}`,
    reviewerAlias: `fixture-editor-${reviewer}`,
    candidateId,
    scores: Object.fromEntries(EDITORIAL_DIMENSIONS.map((dimension) => [
      dimension,
      { score, rationale: `${dimension} has explicit fixture editorial evidence.` },
    ])),
  };
}

test('rubric exposes explicit anchors for every allowed score', () => {
  assert.deepEqual(Object.keys(EDITORIAL_SCORE_ANCHORS), ['1', '2', '3', '4', '5']);
});

test('two complete reviews can select the stronger trusted candidate', () => {
  const result = aggregateEditorialReviews(
    [trustReport('candidate-alpha'), trustReport('candidate-beta')],
    [
      review('candidate-alpha', 'one', 5),
      review('candidate-alpha', 'two', 5),
      review('candidate-beta', 'one', 4),
      review('candidate-beta', 'two', 4),
    ],
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.report.decision, {
    status: 'selected',
    selectedCandidateIds: ['candidate-alpha'],
  });
});

test('one review never silently becomes consensus', () => {
  const result = aggregateEditorialReviews(
    [trustReport('candidate-alpha')],
    [review('candidate-alpha', 'one')],
  );
  assert.equal(result.report.decision.status, 'needs-more-reviews');
  assert.deepEqual(result.report.decision.selectedCandidateIds, []);
});

test('a trusted candidate with no review stays explicit and finite', () => {
  const result = aggregateEditorialReviews(
    [trustReport('candidate-alpha'), trustReport('candidate-beta')],
    [review('candidate-alpha', 'one'), review('candidate-alpha', 'two')],
  );
  assert.equal(result.report.decision.status, 'needs-more-reviews');
  const missing = result.report.candidates.find(({ candidateId }) => candidateId === 'candidate-beta');
  assert.equal(missing.overallScore, null);
  assert.equal(missing.dimensions.clarity.average, null);
  assert.equal(missing.dimensions.clarity.entries.length, 0);
});

test('equal eligible candidates remain an explicit tie', () => {
  const result = aggregateEditorialReviews(
    [trustReport('candidate-alpha'), trustReport('candidate-beta')],
    [
      review('candidate-alpha', 'one'),
      review('candidate-alpha', 'two'),
      review('candidate-beta', 'one'),
      review('candidate-beta', 'two'),
    ],
  );
  assert.deepEqual(result.report.decision, {
    status: 'tie',
    selectedCandidateIds: ['candidate-alpha', 'candidate-beta'],
  });
});

test('material reviewer disagreement blocks selection and stays visible', () => {
  const low = review('candidate-alpha', 'one', 2);
  const high = review('candidate-alpha', 'two', 5);
  const result = aggregateEditorialReviews([trustReport('candidate-alpha')], [low, high]);
  assert.equal(result.report.decision.status, 'review-required');
  assert.equal(result.report.disagreement[0].disagreement.present, true);
  assert.deepEqual(result.report.disagreement[0].disagreement.dimensions, EDITORIAL_DIMENSIONS);
  assert.equal(result.report.candidates[0].dimensions.usefulness.entries.length, 2);
});

test('candidate failing a trust threshold cannot enter editorial scoring', () => {
  const unsafe = trustReport('candidate-unsafe');
  unsafe.passed = false;
  unsafe.metrics.grounding = 0.9;
  assert.equal(
    aggregateEditorialReviews([unsafe], [review('candidate-unsafe', 'one')]).error,
    'candidate-must-pass-all-trust-thresholds',
  );
});

test('missing dimensions, invalid scores, and unknown fields fail closed', () => {
  const missing = review('candidate-alpha', 'one');
  delete missing.scores.clarity;
  assert.equal(
    aggregateEditorialReviews([trustReport('candidate-alpha')], [missing]).error,
    'complete-editorial-dimensions-required',
  );
  const invalid = review('candidate-alpha', 'one');
  invalid.scores.clarity.score = 6;
  assert.equal(
    aggregateEditorialReviews([trustReport('candidate-alpha')], [invalid]).error,
    'editorial-score-must-be-one-to-five',
  );
  const unknown = review('candidate-alpha', 'one');
  unknown.hiddenWeight = 2;
  assert.equal(
    aggregateEditorialReviews([trustReport('candidate-alpha')], [unknown]).error,
    'editorial-review-closed-schema-required',
  );
});

test('sensitive rationale is rejected and reviewer identity is not output', () => {
  const unsafe = review('candidate-alpha', 'one');
  unsafe.scores.clarity.rationale = 'Contact stylist@example.com for the private prompt.';
  assert.equal(
    aggregateEditorialReviews([trustReport('candidate-alpha')], [unsafe]).error,
    'sensitive-editorial-rationale-rejected',
  );
  const report = aggregateEditorialReviews(
    [trustReport('candidate-alpha')],
    [review('candidate-alpha', 'one'), review('candidate-alpha', 'two')],
  ).report;
  assert.equal(JSON.stringify(report).includes('fixture-editor'), false);
});

test('aggregate output is byte-stable for identical fixture input', () => {
  const reports = [trustReport('candidate-alpha')];
  const reviews = [review('candidate-alpha', 'one'), review('candidate-alpha', 'two')];
  const first = aggregateEditorialReviews(reports, reviews);
  const second = aggregateEditorialReviews(reports, reviews);
  assert.equal(serializeEditorialReport(first.report), serializeEditorialReport(second.report));
});
