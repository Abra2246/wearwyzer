import { evaluateStylistScenario } from './ai-stylist-evaluator.mjs';
import {
  POSITIVE_STYLIST_SCENARIOS,
} from './__fixtures__/ai-stylist-evaluation-scenarios.mjs';
import { STYLIST_INTENTS } from './ai-stylist-contract.mjs';

export const STYLIST_EVIDENCE_MODES = Object.freeze(['current', 'stale', 'insufficient']);

function clone(value) {
  return structuredClone(value);
}

function scenarioFor(intent, evidenceMode) {
  const fixture = POSITIVE_STYLIST_SCENARIOS.find(
    (scenario) => scenario.requestInput.intent === intent,
  );
  if (!fixture) return null;
  const scenario = clone(fixture);
  scenario.scenarioId = `journey-${intent}-${evidenceMode}`;
  if (evidenceMode === 'stale') {
    scenario.expectedOutcome = 'abstain';
    scenario.requestInput.evidence.find(
      (record) => record.evidenceId === 'product-v3',
    ).state = 'stale';
  }
  if (evidenceMode === 'insufficient') {
    scenario.expectedOutcome = 'abstain';
    scenario.draft.claims = [];
  }
  return scenario;
}

export function createStylistJourneyState() {
  let intent = STYLIST_INTENTS[0];
  let evidenceMode = STYLIST_EVIDENCE_MODES[0];
  let result = null;

  function selectIntent(nextIntent) {
    if (!STYLIST_INTENTS.includes(nextIntent)) {
      return { ok: false, error: 'unsupported-stylist-intent' };
    }
    intent = nextIntent;
    result = null;
    return { ok: true, view: getView() };
  }

  function selectEvidenceMode(nextMode) {
    if (!STYLIST_EVIDENCE_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-evidence-mode' };
    }
    evidenceMode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const scenario = scenarioFor(intent, evidenceMode);
    if (!scenario) return { ok: false, error: 'fixture-scenario-unavailable' };
    const evaluated = evaluateStylistScenario(scenario);
    if (!evaluated.ok || !evaluated.result.passed) {
      return {
        ok: false,
        error: 'fixture-evaluation-failed',
        failures: evaluated.result?.failures ?? [],
      };
    }
    result = clone(evaluated.result.normalizedOutput);
    return { ok: true, view: getView() };
  }

  function reset() {
    intent = STYLIST_INTENTS[0];
    evidenceMode = STYLIST_EVIDENCE_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      providerMode: 'fixture-only-no-network',
      intent,
      evidenceMode,
      supportedIntents: [...STYLIST_INTENTS],
      supportedEvidenceModes: [...STYLIST_EVIDENCE_MODES],
      result: clone(result),
      externalActionsAvailable: false,
    };
  }

  return {
    selectIntent,
    selectEvidenceMode,
    run,
    reset,
    getView,
  };
}
