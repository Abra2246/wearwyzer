import { buildBrandPreferenceFitMemory } from './brand-preference-fit-memory.mjs';

export const BRAND_MEMORY_MODES = Object.freeze([
  'explicit-and-inferred',
  'corrected-avoidance',
  'reversed-correction',
  'avoided-brand',
  'review-required',
  'low-confidence',
]);

const MODE_SUMMARIES = Object.freeze({
  'explicit-and-inferred': 'Explicit choices stay distinct from accepted inferred evidence.',
  'corrected-avoidance': 'An explicit correction removes avoidance and adds a favorite role.',
  'reversed-correction': 'A later correction reverses an earlier role without retaining stale memory.',
  'avoided-brand': 'An avoided brand remains excluded and cannot influence recommendations.',
  'review-required': 'Avoidance combined with a positive role pauses recommendation influence.',
  'low-confidence': 'Inference below the confidence threshold is ignored.',
});

function input(overrides = {}) {
  return {
    profileVersion: 1,
    explicitRoles: [
      { brandId: 'adidas', role: 'favorite', source: 'explicit-user' },
      { brandId: 'clarks', role: 'best-fitting', source: 'explicit-user' },
    ],
    inferredSignals: [
      {
        brandId: 'dickies',
        signal: 'most-worn-likelihood',
        confidence: 0.88,
        evidenceCode: 'wardrobe-frequency',
      },
    ],
    corrections: [],
    fitMemory: [
      {
        itemId: 'owned-clarks-wallabee',
        brandId: 'clarks',
        category: 'footwear',
        size: 'US 10',
        outcome: 'as-preferred',
        source: 'explicit-user',
      },
    ],
    ...overrides,
  };
}

function scenario(mode) {
  if (mode === 'corrected-avoidance') {
    return input({
      explicitRoles: [
        { brandId: 'salomon', role: 'avoided', source: 'explicit-user' },
      ],
      inferredSignals: [{
        brandId: 'salomon',
        signal: 'favorite-likelihood',
        confidence: 0.94,
        evidenceCode: 'saved-style-selection',
      }],
      corrections: [
        {
          correctionId: 'salomon-avoidance-remove',
          version: 1,
          brandId: 'salomon',
          role: 'avoided',
          action: 'remove',
        },
        {
          correctionId: 'salomon-favorite-add',
          version: 1,
          brandId: 'salomon',
          role: 'favorite',
          action: 'add',
        },
      ],
      fitMemory: [],
    });
  }
  if (mode === 'reversed-correction') {
    return input({
      explicitRoles: [],
      inferredSignals: [],
      corrections: [
        {
          correctionId: 'aspirational-add',
          version: 1,
          brandId: 'premium-fixture-brand',
          role: 'aspirational',
          action: 'add',
        },
        {
          correctionId: 'aspirational-remove',
          version: 2,
          brandId: 'premium-fixture-brand',
          role: 'aspirational',
          action: 'remove',
        },
      ],
      fitMemory: [],
    });
  }
  if (mode === 'avoided-brand') {
    return input({
      explicitRoles: [
        { brandId: 'avoid-fixture-brand', role: 'avoided', source: 'explicit-user' },
      ],
      inferredSignals: [],
      fitMemory: [],
    });
  }
  if (mode === 'review-required') {
    return input({
      explicitRoles: [
        { brandId: 'conflict-fixture-brand', role: 'avoided', source: 'explicit-user' },
        { brandId: 'conflict-fixture-brand', role: 'best-fitting', source: 'explicit-user' },
      ],
      inferredSignals: [],
      fitMemory: [],
    });
  }
  if (mode === 'low-confidence') {
    return input({
      explicitRoles: [],
      inferredSignals: [{
        brandId: 'weak-fixture-signal',
        signal: 'favorite-likelihood',
        confidence: 0.42,
        evidenceCode: 'saved-style-selection',
      }],
      fitMemory: [],
    });
  }
  return input();
}

export function createBrandPreferenceFitMemoryJourney() {
  let mode = BRAND_MEMORY_MODES[0];
  let result = null;

  function selectMode(nextMode) {
    if (!BRAND_MEMORY_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-brand-memory-mode' };
    }
    mode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const memory = buildBrandPreferenceFitMemory(scenario(mode));
    if (!memory.ok) return memory;
    result = structuredClone(memory.result);
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = BRAND_MEMORY_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      modeSummary: MODE_SUMMARIES[mode],
      supportedModes: [...BRAND_MEMORY_MODES],
      result: structuredClone(result),
      commerceActionsAvailable: false,
      behaviorCollectionAvailable: false,
      networkActionsAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
