import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const STYLE_DNA_VERSION = 'style-dna-v1';
export const STYLE_DNA_DIMENSIONS = Object.freeze([
  'aesthetic',
  'palette',
  'silhouette',
  'formality',
  'layering',
  'material',
  'occasion',
  'risk-tolerance',
]);

const DIMENSIONS = new Set(STYLE_DNA_DIMENSIONS);
const SENTIMENTS = new Set(['positive', 'negative']);
const ACTIONS = new Set(['set', 'remove']);
const EVIDENCE_CODES = new Set([
  'owned-style-summary',
  'saved-outfit-feedback',
  'rejected-outfit-feedback',
  'wear-frequency-summary',
  'explicit-style-feedback',
]);
const INPUT_KEYS = new Set([
  'profileVersion',
  'nowIso',
  'explicitSignals',
  'inferredSignals',
  'corrections',
  'exploration',
]);
const EXPLICIT_KEYS = new Set(['dimension', 'value', 'sentiment', 'source']);
const INFERRED_KEYS = new Set([
  'dimension',
  'value',
  'sentiment',
  'confidence',
  'evidenceCode',
  'observedAtIso',
]);
const CORRECTION_KEYS = new Set([
  'correctionId',
  'version',
  'dimension',
  'value',
  'action',
  'sentiment',
]);
const EXPLORATION_KEYS = new Set(['enabled', 'signals']);
const EXPLORATION_SIGNAL_KEYS = new Set(['dimension', 'value']);
const INFERENCE_THRESHOLD = 0.7;

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

function validIso(value) {
  return nonempty(value) && !Number.isNaN(Date.parse(value));
}

function signalKey({ dimension, value }) {
  return `${dimension}\u0000${value}`;
}

function uniqueBy(records, keyFor) {
  return new Set(records.map(keyFor)).size === records.length;
}

function validInput(input) {
  if (!exactKeys(input, INPUT_KEYS)
    || !Number.isInteger(input.profileVersion)
    || input.profileVersion < 1
    || !validIso(input.nowIso)
    || !Array.isArray(input.explicitSignals)
    || !Array.isArray(input.inferredSignals)
    || !Array.isArray(input.corrections)
    || !exactKeys(input.exploration, EXPLORATION_KEYS)
    || typeof input.exploration.enabled !== 'boolean'
    || !Array.isArray(input.exploration.signals)) {
    return false;
  }
  if (!input.explicitSignals.every((signal) => (
    exactKeys(signal, EXPLICIT_KEYS)
    && DIMENSIONS.has(signal.dimension)
    && nonempty(signal.value)
    && SENTIMENTS.has(signal.sentiment)
    && signal.source === 'explicit-user'
  ))) return false;
  if (!input.inferredSignals.every((signal) => (
    exactKeys(signal, INFERRED_KEYS)
    && DIMENSIONS.has(signal.dimension)
    && nonempty(signal.value)
    && SENTIMENTS.has(signal.sentiment)
    && Number.isFinite(signal.confidence)
    && signal.confidence >= 0
    && signal.confidence <= 1
    && EVIDENCE_CODES.has(signal.evidenceCode)
    && validIso(signal.observedAtIso)
  ))) return false;
  if (!input.corrections.every((correction) => (
    exactKeys(correction, CORRECTION_KEYS)
    && nonempty(correction.correctionId)
    && Number.isInteger(correction.version)
    && correction.version > 0
    && DIMENSIONS.has(correction.dimension)
    && nonempty(correction.value)
    && ACTIONS.has(correction.action)
    && (correction.action === 'remove'
      ? correction.sentiment === null
      : SENTIMENTS.has(correction.sentiment))
  ))) return false;
  if (!input.exploration.signals.every((signal) => (
    exactKeys(signal, EXPLORATION_SIGNAL_KEYS)
    && DIMENSIONS.has(signal.dimension)
    && nonempty(signal.value)
  ))) return false;
  return uniqueBy(input.explicitSignals, signalKey)
    && uniqueBy(input.inferredSignals, signalKey)
    && uniqueBy(input.corrections, ({ correctionId }) => correctionId)
    && uniqueBy(input.exploration.signals, signalKey);
}

function ageDays(observedAtIso, nowIso) {
  return (Date.parse(nowIso) - Date.parse(observedAtIso)) / 86_400_000;
}

function decayFactor(days) {
  if (days < 0) return null;
  if (days <= 30) return 1;
  if (days <= 90) return 0.85;
  if (days <= 180) return 0.65;
  return 0;
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function confidenceBand(value) {
  if (value >= 0.9) return 'high';
  if (value >= INFERENCE_THRESHOLD) return 'moderate';
  return 'low';
}

function sortedSignals(signals) {
  return [...signals].sort(
    (left, right) => STYLE_DNA_DIMENSIONS.indexOf(left.dimension)
      - STYLE_DNA_DIMENSIONS.indexOf(right.dimension)
      || left.value.localeCompare(right.value),
  );
}

export function buildStyleDna(input) {
  if (!validInput(input)) {
    return { ok: false, error: 'valid-minimized-style-dna-evidence-required' };
  }

  const states = new Map();
  const inferredByKey = new Map();
  const inferenceSummary = {
    acceptedCount: 0,
    ignoredLowConfidenceCount: 0,
    ignoredStaleCount: 0,
  };

  for (const inferred of input.inferredSignals) {
    const days = ageDays(inferred.observedAtIso, input.nowIso);
    const factor = decayFactor(days);
    if (factor === null) {
      return { ok: false, error: 'future-style-dna-evidence-not-allowed' };
    }
    const confidence = rounded(inferred.confidence * factor);
    if (factor === 0) {
      inferenceSummary.ignoredStaleCount += 1;
      continue;
    }
    if (confidence < INFERENCE_THRESHOLD) {
      inferenceSummary.ignoredLowConfidenceCount += 1;
      continue;
    }
    const key = signalKey(inferred);
    const record = {
      dimension: inferred.dimension,
      value: inferred.value,
      sentiment: inferred.sentiment,
      source: 'inferred',
      confidence,
      confidenceBand: confidenceBand(confidence),
      evidenceCodes: [inferred.evidenceCode],
    };
    inferredByKey.set(key, record);
    states.set(key, record);
    inferenceSummary.acceptedCount += 1;
  }

  const conflicts = [];
  for (const explicit of input.explicitSignals) {
    const key = signalKey(explicit);
    const inferred = inferredByKey.get(key);
    if (inferred && inferred.sentiment !== explicit.sentiment) {
      conflicts.push({
        dimension: explicit.dimension,
        value: explicit.value,
        code: 'explicit-and-inferred-sentiment-conflict',
        acceptedSource: 'explicit-user',
      });
    }
    states.set(key, {
      dimension: explicit.dimension,
      value: explicit.value,
      sentiment: explicit.sentiment,
      source: 'explicit-user',
      confidence: 1,
      confidenceBand: 'high',
      evidenceCodes: ['explicit-user-selection'],
    });
  }

  const corrections = [...input.corrections].sort(
    (left, right) => left.version - right.version
      || left.correctionId.localeCompare(right.correctionId),
  );
  const correctionVersions = new Map();
  for (const correction of corrections) {
    const key = signalKey(correction);
    const priorVersion = correctionVersions.get(key) ?? 0;
    if (correction.version <= priorVersion) {
      return { ok: false, error: 'non-increasing-style-dna-correction-version' };
    }
    correctionVersions.set(key, correction.version);
    if (correction.action === 'remove') {
      states.delete(key);
    } else {
      states.set(key, {
        dimension: correction.dimension,
        value: correction.value,
        sentiment: correction.sentiment,
        source: 'explicit-correction',
        confidence: 1,
        confidenceBand: 'high',
        evidenceCodes: [`correction-${correction.version}-set`],
      });
    }
  }

  const explorationSignals = input.exploration.enabled
    ? sortedSignals(input.exploration.signals)
    : [];
  for (const exploration of explorationSignals) {
    const canonical = states.get(signalKey(exploration));
    if (canonical?.sentiment === 'negative') {
      conflicts.push({
        dimension: exploration.dimension,
        value: exploration.value,
        code: 'exploration-conflicts-with-canonical-negative',
        acceptedSource: canonical.source,
      });
    }
  }

  return {
    ok: true,
    result: {
      schemaVersion: STYLE_DNA_VERSION,
      profileVersion: input.profileVersion,
      status: conflicts.length ? 'review-required' : 'ready',
      signals: sortedSignals(states.values()),
      conflicts: [...conflicts].sort(
        (left, right) => STYLE_DNA_DIMENSIONS.indexOf(left.dimension)
          - STYLE_DNA_DIMENSIONS.indexOf(right.dimension)
          || left.value.localeCompare(right.value)
          || left.code.localeCompare(right.code),
      ),
      inferenceSummary,
      exploration: {
        enabled: input.exploration.enabled,
        signals: explorationSignals,
        affectsCanonicalProfile: false,
      },
      policy: {
        explicitInputOutranksInference: true,
        correctionsAreReversible: true,
        inferenceThreshold: INFERENCE_THRESHOLD,
        staleInferenceExcluded: true,
        explorationIsTemporary: true,
        commercialInfluenceAllowed: false,
      },
    },
  };
}

export function serializeStyleDna(result) {
  return stableSerialize(result);
}
