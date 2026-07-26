import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EVAL_THRESHOLDS,
  evaluateStylistPortfolio,
  evaluateStylistScenario,
  stableSerialize,
} from '../ai-stylist-evaluator.mjs';
import {
  ADVERSARIAL_STYLIST_SCENARIOS,
  ALL_STYLIST_EVALUATION_SCENARIOS,
  POSITIVE_STYLIST_SCENARIOS,
} from '../__fixtures__/ai-stylist-evaluation-scenarios.mjs';
import { STYLIST_INTENTS } from '../ai-stylist-contract.mjs';

test('positive fixtures cover every supported intent and pass', () => {
  const results = POSITIVE_STYLIST_SCENARIOS.map(
    (scenario) => evaluateStylistScenario(scenario).result,
  );
  assert.deepEqual(results.map((result) => result.intent).sort(), [...STYLIST_INTENTS].sort());
  assert.equal(results.every((result) => result.passed), true);
  assert.equal(results.every((result) => result.actualOutcome === 'answer'), true);
});

test('every named adversarial fixture fails closed or abstains as expected', () => {
  const results = ADVERSARIAL_STYLIST_SCENARIOS.map(
    (scenario) => evaluateStylistScenario(scenario).result,
  );
  assert.equal(results.every((result) => result.passed), true);
  assert.deepEqual(results.map((result) => result.scenarioId), [
    'adversarial-missing-citation',
    'adversarial-unowned-item',
    'adversarial-invented-price',
    'adversarial-stale-source',
    'adversarial-ambiguous-source',
    'adversarial-conflicting-source',
    'adversarial-private-field',
    'adversarial-external-action',
    'adversarial-insufficient-evidence',
  ]);
});

test('missing citations and invented ownership/product facts report exact errors', () => {
  const byId = Object.fromEntries(
    ADVERSARIAL_STYLIST_SCENARIOS.map((scenario) => [
      scenario.scenarioId,
      evaluateStylistScenario(scenario).result,
    ]),
  );
  assert.equal(byId['adversarial-missing-citation'].expectedError, 'material-claim-citation-required');
  assert.equal(byId['adversarial-unowned-item'].expectedError, 'unowned-item-claim');
  assert.equal(byId['adversarial-invented-price'].expectedError, 'fact-not-grounded');
});

test('stale, ambiguous, conflicting, and insufficient fixtures abstain', () => {
  const ids = [
    'adversarial-stale-source',
    'adversarial-ambiguous-source',
    'adversarial-conflicting-source',
    'adversarial-insufficient-evidence',
  ];
  for (const id of ids) {
    const scenario = ADVERSARIAL_STYLIST_SCENARIOS.find((entry) => entry.scenarioId === id);
    assert.equal(evaluateStylistScenario(scenario).result.actualOutcome, 'abstain');
  }
});

test('private-field and external-action requests fail at the request boundary', () => {
  for (const id of ['adversarial-private-field', 'adversarial-external-action']) {
    const scenario = ADVERSARIAL_STYLIST_SCENARIOS.find((entry) => entry.scenarioId === id);
    assert.equal(evaluateStylistScenario(scenario).result.actualOutcome, 'request-error');
  }
});

test('minimized positive outputs contain no scenario privacy tokens', () => {
  for (const scenario of POSITIVE_STYLIST_SCENARIOS) {
    const result = evaluateStylistScenario(scenario).result;
    const serialized = stableSerialize(result.normalizedOutput);
    for (const token of scenario.forbiddenOutputTokens) {
      assert.equal(serialized.includes(token), false);
    }
    assert.equal(result.metrics.privacy, true);
  }
});

test('identical scenario inputs produce byte-stable normalized results', () => {
  const scenario = POSITIVE_STYLIST_SCENARIOS[0];
  const first = evaluateStylistScenario(scenario).result;
  const second = evaluateStylistScenario(scenario).result;
  assert.equal(first.metrics.repeatability, true);
  assert.equal(stableSerialize(first), stableSerialize(second));
});

test('the complete portfolio passes every fail-closed threshold', () => {
  const evaluated = evaluateStylistPortfolio(ALL_STYLIST_EVALUATION_SCENARIOS);
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.report.passed, true);
  assert.equal(evaluated.report.scenarioCount, 15);
  assert.deepEqual(evaluated.report.metrics, DEFAULT_EVAL_THRESHOLDS);
  assert.deepEqual(evaluated.report.missingIntents, []);
  assert.deepEqual(evaluated.report.failedScenarioIds, []);
  assert.deepEqual(evaluated.report.thresholdFailures, []);
  assert.equal(evaluated.report.providerMode, 'fixture-only-no-network');
});

test('a broken expected outcome identifies the exact failed scenario and metric', () => {
  const broken = structuredClone(ALL_STYLIST_EVALUATION_SCENARIOS);
  broken[0].expectedOutcome = 'abstain';
  const evaluated = evaluateStylistPortfolio(broken);
  assert.equal(evaluated.report.passed, false);
  assert.deepEqual(evaluated.report.failedScenarioIds, [broken[0].scenarioId]);
  assert.ok(evaluated.report.results[0].failures.includes('expected-outcome:abstain:actual:answer'));
  assert.deepEqual(evaluated.report.thresholdFailures, [
    { metric: 'grounding', actual: 0.9333, required: 1 },
    { metric: 'abstentionCorrectness', actual: 0.9333, required: 1 },
  ]);
});

test('duplicate scenarios and an empty portfolio fail closed', () => {
  assert.equal(evaluateStylistPortfolio([]).error, 'evaluation-scenarios-required');
  const duplicate = [
    POSITIVE_STYLIST_SCENARIOS[0],
    structuredClone(POSITIVE_STYLIST_SCENARIOS[0]),
  ];
  assert.equal(evaluateStylistPortfolio(duplicate).error, 'duplicate-evaluation-scenario');
});
