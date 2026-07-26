import { buildStyleDna } from './style-dna-contract.mjs';

export const STYLE_DNA_MODES = Object.freeze([
  'explicit-and-inferred',
  'explicit-conflict',
  'decayed-inference',
  'stale-and-low-confidence',
  'corrected-signal',
  'reversed-correction',
  'temporary-exploration',
]);

const NOW = '2026-07-26T00:00:00.000Z';
const MODE_SUMMARIES = Object.freeze({
  'explicit-and-inferred': 'Explicit preferences stay distinct from accepted inferred evidence.',
  'explicit-conflict': 'An explicit choice remains canonical while contradictory inference requires review.',
  'decayed-inference': 'Recent-enough inference remains usable with visibly reduced confidence.',
  'stale-and-low-confidence': 'Stale and weak inference stays outside canonical Style DNA.',
  'corrected-signal': 'An explicit correction replaces an inferred style signal.',
  'reversed-correction': 'A later correction removes an earlier signal without leaving stale memory.',
  'temporary-exploration': 'Exploration stays temporary and separate from canonical Style DNA.',
});

function explicit(dimension, value, sentiment = 'positive') {
  return { dimension, value, sentiment, source: 'explicit-user' };
}

function inferred(
  dimension,
  value,
  confidence,
  observedAtIso,
  sentiment = 'positive',
  evidenceCode = 'owned-style-summary',
) {
  return {
    dimension,
    value,
    sentiment,
    confidence,
    evidenceCode,
    observedAtIso,
  };
}

function input(overrides = {}) {
  return {
    profileVersion: 1,
    nowIso: NOW,
    explicitSignals: [
      explicit('aesthetic', 'minimal'),
      explicit('palette', 'earth-tones'),
    ],
    inferredSignals: [
      inferred('silhouette', 'relaxed', 0.9, '2026-07-10T00:00:00.000Z'),
    ],
    corrections: [],
    exploration: { enabled: false, signals: [] },
    ...overrides,
  };
}

function scenario(mode) {
  if (mode === 'explicit-conflict') {
    return input({
      explicitSignals: [explicit('palette', 'neon', 'negative')],
      inferredSignals: [
        inferred(
          'palette',
          'neon',
          0.95,
          '2026-07-20T00:00:00.000Z',
          'positive',
          'saved-outfit-feedback',
        ),
      ],
    });
  }
  if (mode === 'decayed-inference') {
    return input({
      explicitSignals: [],
      inferredSignals: [
        inferred(
          'formality',
          'smart-casual',
          0.9,
          '2026-05-28T00:00:00.000Z',
          'positive',
          'saved-outfit-feedback',
        ),
      ],
    });
  }
  if (mode === 'stale-and-low-confidence') {
    return input({
      explicitSignals: [],
      inferredSignals: [
        inferred(
          'material',
          'linen',
          1,
          '2025-12-01T00:00:00.000Z',
        ),
        inferred(
          'layering',
          'overshirt',
          0.75,
          '2026-05-28T00:00:00.000Z',
          'positive',
          'wear-frequency-summary',
        ),
      ],
    });
  }
  if (mode === 'corrected-signal') {
    return input({
      explicitSignals: [],
      inferredSignals: [
        inferred(
          'risk-tolerance',
          'experimental',
          0.9,
          '2026-07-12T00:00:00.000Z',
          'positive',
          'saved-outfit-feedback',
        ),
      ],
      corrections: [{
        correctionId: 'experimental-negative',
        version: 1,
        dimension: 'risk-tolerance',
        value: 'experimental',
        action: 'set',
        sentiment: 'negative',
      }],
    });
  }
  if (mode === 'reversed-correction') {
    return input({
      explicitSignals: [],
      inferredSignals: [],
      corrections: [
        {
          correctionId: 'suede-positive',
          version: 1,
          dimension: 'material',
          value: 'suede',
          action: 'set',
          sentiment: 'positive',
        },
        {
          correctionId: 'suede-remove',
          version: 2,
          dimension: 'material',
          value: 'suede',
          action: 'remove',
          sentiment: null,
        },
      ],
    });
  }
  if (mode === 'temporary-exploration') {
    return input({
      explicitSignals: [
        explicit('aesthetic', 'minimal'),
        explicit('palette', 'neon', 'negative'),
      ],
      inferredSignals: [],
      exploration: {
        enabled: true,
        signals: [
          { dimension: 'aesthetic', value: 'avant-garde' },
          { dimension: 'palette', value: 'neon' },
        ],
      },
    });
  }
  return input();
}

export function createStyleDnaJourney() {
  let mode = STYLE_DNA_MODES[0];
  let result = null;

  function selectMode(nextMode) {
    if (!STYLE_DNA_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-style-dna-mode' };
    }
    mode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const dna = buildStyleDna(scenario(mode));
    if (!dna.ok) return dna;
    result = structuredClone(dna.result);
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = STYLE_DNA_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      modeSummary: MODE_SUMMARIES[mode],
      supportedModes: [...STYLE_DNA_MODES],
      result: structuredClone(result),
      commerceActionsAvailable: false,
      behaviorCollectionAvailable: false,
      networkActionsAvailable: false,
      persistenceAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
