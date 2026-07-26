import {
  ALL_STYLIST_EVALUATION_SCENARIOS,
} from './__fixtures__/ai-stylist-evaluation-scenarios.mjs';
import {
  DEFAULT_EVAL_THRESHOLDS,
  evaluateStylistPortfolio,
  stableSerialize,
} from './ai-stylist-evaluator.mjs';

export const STYLIST_CANDIDATE_VERSION = 'ai-stylist-candidate-v1';
export const STYLIST_REPLAY_REPORT_VERSION = 'ai-stylist-replay-report-v1';

const ENVELOPE_KEYS = new Set([
  'schemaVersion',
  'candidateId',
  'providerAlias',
  'fixtureVersion',
  'scenarios',
]);
const SCENARIO_KEYS = new Set(['scenarioId', 'draft']);
const PRIVATE_KEYS = new Set([
  'privatePrompt',
  'requestInput',
  'evidence',
  'facts',
  'profile',
  'wardrobe',
  'apiKey',
  'token',
]);
const TRUSTED_SCENARIOS = new Map(
  ALL_STYLIST_EVALUATION_SCENARIOS.map((scenario) => [scenario.scenarioId, scenario]),
);

function clone(value) {
  return structuredClone(value);
}

function hasUnknownKeys(value, allowed) {
  return !value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.has(key));
}

function findPrivateKey(value, path = 'candidate') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const finding = findPrivateKey(value[index], `${path}[${index}]`);
      if (finding) return finding;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_KEYS.has(key)) return `${path}.${key}`;
    const finding = findPrivateKey(child, `${path}.${key}`);
    if (finding) return finding;
  }
  return null;
}

function validateEnvelope(envelope) {
  if (hasUnknownKeys(envelope, ENVELOPE_KEYS)) return 'candidate-envelope-closed-schema-required';
  if (envelope.schemaVersion !== STYLIST_CANDIDATE_VERSION) return 'unsupported-candidate-version';
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(envelope.candidateId ?? '')) {
    return 'valid-candidate-id-required';
  }
  if (!/^fixture-[a-z0-9-]{2,48}$/.test(envelope.providerAlias ?? '')) {
    return 'synthetic-provider-alias-required';
  }
  if (!Number.isInteger(envelope.fixtureVersion) || envelope.fixtureVersion < 1) {
    return 'valid-fixture-version-required';
  }
  if (!Array.isArray(envelope.scenarios) || envelope.scenarios.length === 0) {
    return 'candidate-scenarios-required';
  }
  const ids = [];
  for (const scenario of envelope.scenarios) {
    if (hasUnknownKeys(scenario, SCENARIO_KEYS)) return 'candidate-scenario-closed-schema-required';
    if (!TRUSTED_SCENARIOS.has(scenario.scenarioId)) return 'unknown-trusted-scenario';
    if (!scenario.draft || typeof scenario.draft !== 'object' || Array.isArray(scenario.draft)) {
      return 'candidate-draft-required';
    }
    ids.push(scenario.scenarioId);
  }
  if (new Set(ids).size !== ids.length) return 'duplicate-candidate-scenario';
  if (ids.length !== TRUSTED_SCENARIOS.size
    || [...TRUSTED_SCENARIOS.keys()].some((id) => !ids.includes(id))) {
    return 'complete-trusted-portfolio-required';
  }
  if (findPrivateKey(envelope)) return 'private-or-secret-candidate-field-rejected';
  return null;
}

function sanitizedResult(result) {
  return {
    scenarioId: result.scenarioId,
    intent: result.intent,
    expectedOutcome: result.expectedOutcome,
    actualOutcome: result.actualOutcome,
    passed: result.passed,
    failures: [...result.failures],
  };
}

export function replayStylistCandidate(envelope) {
  const error = validateEnvelope(envelope);
  if (error) return { ok: false, error };
  const candidateDrafts = new Map(
    envelope.scenarios.map((scenario) => [scenario.scenarioId, scenario.draft]),
  );
  const scenarios = ALL_STYLIST_EVALUATION_SCENARIOS.map((trusted) => ({
    ...clone(trusted),
    draft: clone(candidateDrafts.get(trusted.scenarioId)),
  }));
  const evaluated = evaluateStylistPortfolio(scenarios, DEFAULT_EVAL_THRESHOLDS);
  if (!evaluated.ok) return evaluated;
  const { report } = evaluated;
  const sanitized = {
    schemaVersion: STYLIST_REPLAY_REPORT_VERSION,
    candidateId: envelope.candidateId,
    providerAlias: envelope.providerAlias,
    fixtureVersion: envelope.fixtureVersion,
    scenarioCount: report.scenarioCount,
    coveredIntents: [...report.coveredIntents],
    missingIntents: [...report.missingIntents],
    metrics: clone(report.metrics),
    thresholds: clone(report.thresholds),
    thresholdFailures: clone(report.thresholdFailures),
    failedScenarioIds: [...report.failedScenarioIds],
    passed: report.passed,
    results: report.results.map(sanitizedResult),
  };
  return { ok: true, report: sanitized };
}

export function compareStylistCandidates(envelopes) {
  if (!Array.isArray(envelopes) || envelopes.length === 0) {
    return { ok: false, error: 'candidate-envelopes-required' };
  }
  const replays = envelopes.map(replayStylistCandidate);
  const reports = replays.filter((result) => result.ok).map((result) => result.report);
  const rejected = replays
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => !result.ok)
    .map(({ result, index }) => ({ index, error: result.error }));
  const eligible = reports.filter((report) => report.passed);
  return {
    ok: true,
    comparison: {
      schemaVersion: STYLIST_REPLAY_REPORT_VERSION,
      status: eligible.length === 0 ? 'no-trusted-candidate' : eligible.length === 1 ? 'selected' : 'tie',
      selectedCandidateIds: eligible.map((report) => report.candidateId).sort(),
      rejected,
      reports,
    },
  };
}

export function createTrustedFixtureCandidate({
  candidateId,
  providerAlias,
  fixtureVersion = 1,
} = {}) {
  return {
    schemaVersion: STYLIST_CANDIDATE_VERSION,
    candidateId,
    providerAlias,
    fixtureVersion,
    scenarios: ALL_STYLIST_EVALUATION_SCENARIOS.map(({ scenarioId, draft }) => ({
      scenarioId,
      draft: clone(draft),
    })),
  };
}

export function serializeReplayReport(report) {
  return stableSerialize(report);
}
