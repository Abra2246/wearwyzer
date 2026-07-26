import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STYLE_DNA_DIMENSIONS,
  STYLE_DNA_VERSION,
  buildStyleDna,
  serializeStyleDna,
} from '../style-dna-contract.mjs';

function base(overrides = {}) {
  return {
    profileVersion: 1,
    nowIso: '2026-07-26T00:00:00.000Z',
    explicitSignals: [
      {
        dimension: 'aesthetic',
        value: 'minimal',
        sentiment: 'positive',
        source: 'explicit-user',
      },
      {
        dimension: 'palette',
        value: 'neon',
        sentiment: 'negative',
        source: 'explicit-user',
      },
    ],
    inferredSignals: [
      {
        dimension: 'silhouette',
        value: 'relaxed',
        sentiment: 'positive',
        confidence: 0.9,
        evidenceCode: 'owned-style-summary',
        observedAtIso: '2026-07-10T00:00:00.000Z',
      },
    ],
    corrections: [],
    exploration: { enabled: false, signals: [] },
    ...overrides,
  };
}

test('version and closed Style DNA dimensions are explicit', () => {
  assert.equal(STYLE_DNA_VERSION, 'style-dna-v1');
  assert.deepEqual(STYLE_DNA_DIMENSIONS, [
    'aesthetic',
    'palette',
    'silhouette',
    'formality',
    'layering',
    'material',
    'occasion',
    'risk-tolerance',
  ]);
});

test('explicit and accepted inferred signals remain distinguishable', () => {
  const result = buildStyleDna(base()).result;
  assert.equal(result.signals.find(({ value }) => value === 'minimal').source, 'explicit-user');
  const relaxed = result.signals.find(({ value }) => value === 'relaxed');
  assert.equal(relaxed.source, 'inferred');
  assert.equal(relaxed.confidence, 0.9);
  assert.equal(relaxed.evidenceCodes[0], 'owned-style-summary');
});

test('explicit sentiment outranks contradictory inference and conflict stays visible', () => {
  const result = buildStyleDna(base({
    inferredSignals: [{
      dimension: 'palette',
      value: 'neon',
      sentiment: 'positive',
      confidence: 0.95,
      evidenceCode: 'saved-outfit-feedback',
      observedAtIso: '2026-07-20T00:00:00.000Z',
    }],
  })).result;
  const neon = result.signals.find(({ value }) => value === 'neon');
  assert.equal(neon.sentiment, 'negative');
  assert.equal(neon.source, 'explicit-user');
  assert.equal(result.status, 'review-required');
  assert.equal(result.conflicts[0].code, 'explicit-and-inferred-sentiment-conflict');
});

test('confidence decay is deterministic and excludes weak or stale inference', () => {
  const result = buildStyleDna(base({
    explicitSignals: [],
    inferredSignals: [
      {
        dimension: 'formality',
        value: 'smart-casual',
        sentiment: 'positive',
        confidence: 0.9,
        evidenceCode: 'saved-outfit-feedback',
        observedAtIso: '2026-05-28T00:00:00.000Z',
      },
      {
        dimension: 'layering',
        value: 'overshirt',
        sentiment: 'positive',
        confidence: 0.75,
        evidenceCode: 'wear-frequency-summary',
        observedAtIso: '2026-05-28T00:00:00.000Z',
      },
      {
        dimension: 'material',
        value: 'linen',
        sentiment: 'positive',
        confidence: 1,
        evidenceCode: 'owned-style-summary',
        observedAtIso: '2025-12-01T00:00:00.000Z',
      },
    ],
  })).result;
  assert.deepEqual(result.signals.map(({ value, confidence }) => ({ value, confidence })), [{
    value: 'smart-casual',
    confidence: 0.77,
  }]);
  assert.deepEqual(result.inferenceSummary, {
    acceptedCount: 1,
    ignoredLowConfidenceCount: 1,
    ignoredStaleCount: 1,
  });
});

test('versioned corrections set, change, remove, and reverse signals', () => {
  const result = buildStyleDna(base({
    explicitSignals: [],
    inferredSignals: [],
    corrections: [
      {
        correctionId: 'one',
        version: 1,
        dimension: 'risk-tolerance',
        value: 'experimental',
        action: 'set',
        sentiment: 'positive',
      },
      {
        correctionId: 'two',
        version: 2,
        dimension: 'risk-tolerance',
        value: 'experimental',
        action: 'set',
        sentiment: 'negative',
      },
    ],
  })).result;
  assert.equal(result.signals[0].sentiment, 'negative');
  assert.equal(result.signals[0].source, 'explicit-correction');
  const removed = buildStyleDna(base({
    explicitSignals: [],
    inferredSignals: [],
    corrections: [
      {
        correctionId: 'add',
        version: 1,
        dimension: 'material',
        value: 'suede',
        action: 'set',
        sentiment: 'positive',
      },
      {
        correctionId: 'remove',
        version: 2,
        dimension: 'material',
        value: 'suede',
        action: 'remove',
        sentiment: null,
      },
    ],
  })).result;
  assert.deepEqual(removed.signals, []);
});

test('exploration stays temporary and separate from canonical Style DNA', () => {
  const result = buildStyleDna(base({
    exploration: {
      enabled: true,
      signals: [
        { dimension: 'aesthetic', value: 'avant-garde' },
        { dimension: 'palette', value: 'neon' },
      ],
    },
  })).result;
  assert.equal(result.exploration.enabled, true);
  assert.equal(result.exploration.affectsCanonicalProfile, false);
  assert.equal(result.signals.some(({ value }) => value === 'avant-garde'), false);
  assert.equal(result.status, 'review-required');
  assert.equal(result.conflicts[0].code, 'exploration-conflicts-with-canonical-negative');
});

test('disabled exploration emits no temporary signals', () => {
  const result = buildStyleDna(base({
    exploration: {
      enabled: false,
      signals: [{ dimension: 'aesthetic', value: 'avant-garde' }],
    },
  })).result;
  assert.deepEqual(result.exploration.signals, []);
});

test('future evidence and non-increasing corrections fail closed', () => {
  const future = base({
    inferredSignals: [{
      dimension: 'occasion',
      value: 'date-night',
      sentiment: 'positive',
      confidence: 1,
      evidenceCode: 'saved-outfit-feedback',
      observedAtIso: '2026-07-27T00:00:00.000Z',
    }],
  });
  assert.equal(buildStyleDna(future).error, 'future-style-dna-evidence-not-allowed');
  const badVersions = base({
    corrections: [
      {
        correctionId: 'one',
        version: 1,
        dimension: 'material',
        value: 'linen',
        action: 'set',
        sentiment: 'positive',
      },
      {
        correctionId: 'two',
        version: 1,
        dimension: 'material',
        value: 'linen',
        action: 'remove',
        sentiment: null,
      },
    ],
  });
  assert.equal(
    buildStyleDna(badVersions).error,
    'non-increasing-style-dna-correction-version',
  );
});

test('unknown, private, commercial, and duplicate evidence fails closed', () => {
  const invalid = [
    base({ browsingHistory: [] }),
    base({ explicitSignals: [{ dimension: 'income', value: 'high', sentiment: 'positive', source: 'explicit-user' }] }),
    base({ inferredSignals: [{
      dimension: 'aesthetic',
      value: 'minimal',
      sentiment: 'positive',
      confidence: 1,
      evidenceCode: 'purchase-history',
      observedAtIso: '2026-07-20T00:00:00.000Z',
    }] }),
    base({ explicitSignals: [
      { dimension: 'aesthetic', value: 'minimal', sentiment: 'positive', source: 'explicit-user' },
      { dimension: 'aesthetic', value: 'minimal', sentiment: 'negative', source: 'explicit-user' },
    ] }),
  ];
  for (const input of invalid) assert.equal(buildStyleDna(input).ok, false);
});

test('policy preserves user control and prohibits commercial influence', () => {
  const policy = buildStyleDna(base()).result.policy;
  assert.equal(policy.explicitInputOutranksInference, true);
  assert.equal(policy.correctionsAreReversible, true);
  assert.equal(policy.staleInferenceExcluded, true);
  assert.equal(policy.explorationIsTemporary, true);
  assert.equal(policy.commercialInfluenceAllowed, false);
});

test('minimized output excludes private behavior, identity, and commerce data', () => {
  const serialized = JSON.stringify(buildStyleDna(base()).result);
  assert.doesNotMatch(
    serialized,
    /wardrobe|browsing|purchase|return|privateNote|account|protectedAttribute|price|retailer|affiliate|commission|popularity/i,
  );
});

test('identical evidence serializes byte-stably', () => {
  const result = buildStyleDna(base()).result;
  assert.equal(
    serializeStyleDna(result),
    serializeStyleDna(structuredClone(result)),
  );
});
