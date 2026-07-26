import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareStylistCandidates,
  createTrustedFixtureCandidate,
  replayStylistCandidate,
  serializeReplayReport,
} from '../ai-stylist-replay-gate.mjs';
import { STYLIST_INTENTS } from '../ai-stylist-contract.mjs';

function validCandidate(id = 'candidate-alpha', alias = 'fixture-alpha') {
  return createTrustedFixtureCandidate({ candidateId: id, providerAlias: alias });
}

test('trusted candidate replays all intents and passes every trust threshold', () => {
  const replay = replayStylistCandidate(validCandidate());
  assert.equal(replay.ok, true);
  assert.equal(replay.report.passed, true);
  assert.deepEqual(replay.report.coveredIntents, [...STYLIST_INTENTS].sort());
  assert.deepEqual(replay.report.missingIntents, []);
  assert.ok(Object.values(replay.report.metrics).every((score) => score === 1));
});

test('identical candidate input produces a byte-stable sanitized report', () => {
  const candidate = validCandidate();
  const first = replayStylistCandidate(candidate);
  const second = replayStylistCandidate(candidate);
  assert.equal(serializeReplayReport(first.report), serializeReplayReport(second.report));
  assert.equal(JSON.stringify(first.report).includes('privatePrompt'), false);
  assert.equal(JSON.stringify(first.report).includes('requestInput'), false);
  assert.equal(JSON.stringify(first.report).includes('"draft"'), false);
});

test('unsafe candidate identifies the exact failed scenario and metrics', () => {
  const candidate = validCandidate('candidate-unsafe', 'fixture-unsafe');
  const unsafe = candidate.scenarios.find(
    ({ scenarioId }) => scenarioId === 'positive-evaluate-purchase',
  );
  unsafe.draft.claims[0].citations = [];
  const replay = replayStylistCandidate(candidate);
  assert.equal(replay.ok, true);
  assert.equal(replay.report.passed, false);
  assert.deepEqual(replay.report.failedScenarioIds, ['positive-evaluate-purchase']);
  assert.ok(replay.report.thresholdFailures.some(({ metric }) => metric === 'grounding'));
  const failed = replay.report.results.find(
    ({ scenarioId }) => scenarioId === 'positive-evaluate-purchase',
  );
  assert.ok(failed.failures.includes('expected-outcome:answer:actual:response-error'));
  assert.ok(failed.failures.includes('metric:grounding:failed'));
});

test('comparison never promotes a candidate below the trust threshold', () => {
  const safe = validCandidate('candidate-safe', 'fixture-safe');
  const unsafe = validCandidate('candidate-unsafe', 'fixture-unsafe');
  unsafe.scenarios.find(({ scenarioId }) => scenarioId === 'positive-style-owned-item')
    .draft.claims[0].subject.itemId = 'not-owned';
  const compared = compareStylistCandidates([unsafe, safe]);
  assert.equal(compared.comparison.status, 'selected');
  assert.deepEqual(compared.comparison.selectedCandidateIds, ['candidate-safe']);
});

test('equally trusted candidates remain an explicit tie', () => {
  const compared = compareStylistCandidates([
    validCandidate('candidate-beta', 'fixture-beta'),
    validCandidate('candidate-alpha', 'fixture-alpha'),
  ]);
  assert.equal(compared.comparison.status, 'tie');
  assert.deepEqual(compared.comparison.selectedCandidateIds, [
    'candidate-alpha',
    'candidate-beta',
  ]);
});

test('closed schemas reject provider payloads, private evidence, and secrets', () => {
  const unknown = validCandidate();
  unknown.model = 'live-provider';
  assert.equal(replayStylistCandidate(unknown).error, 'candidate-envelope-closed-schema-required');

  const privateCandidate = validCandidate();
  privateCandidate.scenarios[0].draft.profile = { styleTags: ['private'] };
  assert.equal(
    replayStylistCandidate(privateCandidate).error,
    'private-or-secret-candidate-field-rejected',
  );
});

test('missing, duplicate, unknown, and incomplete portfolios fail closed', () => {
  const incomplete = validCandidate();
  incomplete.scenarios.pop();
  assert.equal(replayStylistCandidate(incomplete).error, 'complete-trusted-portfolio-required');

  const duplicate = validCandidate();
  duplicate.scenarios[1].scenarioId = duplicate.scenarios[0].scenarioId;
  assert.equal(replayStylistCandidate(duplicate).error, 'duplicate-candidate-scenario');

  const unknown = validCandidate();
  unknown.scenarios[0].scenarioId = 'unknown-scenario';
  assert.equal(replayStylistCandidate(unknown).error, 'unknown-trusted-scenario');
});

test('comparison exposes invalid envelopes without inventing a winner', () => {
  const invalid = validCandidate();
  invalid.providerAlias = 'OpenAI';
  const compared = compareStylistCandidates([invalid]);
  assert.equal(compared.ok, true);
  assert.equal(compared.comparison.status, 'no-trusted-candidate');
  assert.deepEqual(compared.comparison.selectedCandidateIds, []);
  assert.deepEqual(compared.comparison.rejected, [
    { index: 0, error: 'synthetic-provider-alias-required' },
  ]);
});
