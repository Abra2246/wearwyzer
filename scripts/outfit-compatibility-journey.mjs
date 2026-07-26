import {
  compareOutfitCompatibility,
  evaluateOutfitCompatibility,
} from './outfit-compatibility-contract.mjs';

export const OUTFIT_COMPATIBILITY_MODES = Object.freeze([
  'compatible',
  'missing-evidence',
  'explicit-style-block',
  'conflicting-fit',
  'missing-required-role',
  'comparison-leader',
  'comparison-tie',
  'none-qualified',
]);

const MODE_SUMMARIES = Object.freeze({
  compatible: 'Current product, fit, ownership, context, and Style DNA evidence supports the outfit.',
  'missing-evidence': 'Unknown fit lowers evidence coverage and requires review without becoming a zero score.',
  'explicit-style-block': 'An explicit negative Style DNA signal creates a visible hard incompatibility.',
  'conflicting-fit': 'Conflicting fit evidence blocks compatibility before soft preference scoring.',
  'missing-required-role': 'A missing core item remains labeled and cannot form a complete outfit.',
  'comparison-leader': 'The strongest qualified outfit leads on decomposed evidence.',
  'comparison-tie': 'Equal qualified outfits remain tied instead of receiving an invented winner.',
  'none-qualified': 'When every outfit is incompatible, the comparison returns none qualified.',
});

function styleSignal(dimension, value, overrides = {}) {
  return {
    dimension,
    value,
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'explicit-user-selection',
    ...overrides,
  };
}

function outfitItem(itemId, productId, ownership, role, overrides = {}) {
  return {
    itemId,
    productId,
    ownership,
    role,
    evidenceState: 'current',
    aesthetics: ['minimal'],
    palette: ['navy'],
    silhouette: 'relaxed',
    formality: 'smart-casual',
    materials: ['cotton'],
    occasions: ['everyday'],
    seasons: ['transitional'],
    layering: role === 'outerwear' ? 'outer-layer' : 'base',
    riskLevel: 'balanced',
    fitStatus: role === 'accessory' ? 'not-applicable' : 'verified',
    ...overrides,
  };
}

function outfit(outfitId = 'fixture-outfit-one', overrides = {}) {
  return {
    outfitId,
    evidenceVersion: 1,
    styleDnaVersion: 'style-dna-v1',
    styleSignals: [
      styleSignal('palette', 'navy'),
      styleSignal('silhouette', 'relaxed'),
      styleSignal('formality', 'smart-casual'),
      styleSignal('material', 'cotton'),
      styleSignal('layering', 'outer-layer'),
    ],
    target: { occasion: 'everyday', season: 'transitional' },
    items: [
      outfitItem('owned-top', 'fixture-top', 'owned', 'top'),
      outfitItem('owned-bottom', 'fixture-bottom', 'owned', 'bottom'),
      outfitItem('prospective-shoe', 'fixture-shoe', 'prospective', 'footwear'),
      outfitItem('owned-jacket', 'fixture-jacket', 'owned', 'outerwear'),
    ],
    ...overrides,
  };
}

function singleScenario(mode) {
  if (mode === 'missing-evidence') {
    return outfit('fixture-missing-evidence', {
      items: outfit().items.map((item) => (
        item.role === 'footwear' ? { ...item, fitStatus: 'unknown' } : item
      )),
    });
  }
  if (mode === 'explicit-style-block') {
    return outfit('fixture-style-block', {
      styleSignals: [
        styleSignal('palette', 'navy', { sentiment: 'negative' }),
      ],
    });
  }
  if (mode === 'conflicting-fit') {
    return outfit('fixture-fit-conflict', {
      items: outfit().items.map((item) => (
        item.role === 'footwear' ? { ...item, fitStatus: 'conflicting' } : item
      )),
    });
  }
  if (mode === 'missing-required-role') {
    return outfit('fixture-missing-role', {
      items: outfit().items.map((item) => (
        item.role === 'bottom' ? { ...item, ownership: 'missing' } : item
      )),
    });
  }
  return outfit();
}

function comparisonScenario(mode) {
  if (mode === 'comparison-leader') {
    const weaker = outfit('fixture-outfit-two', {
      items: outfit().items.map((item) => ({
        ...item,
        palette: ['cream'],
        silhouette: 'straight',
      })),
    });
    return [outfit(), weaker];
  }
  if (mode === 'comparison-tie') {
    return [outfit(), outfit('fixture-outfit-tie')];
  }
  const blocked = outfit('fixture-outfit-blocked', {
    styleSignals: [
      styleSignal('palette', 'navy', { sentiment: 'negative' }),
    ],
  });
  return [blocked, { ...blocked, outfitId: 'fixture-outfit-blocked-two' }];
}

export function createOutfitCompatibilityJourney() {
  let mode = OUTFIT_COMPATIBILITY_MODES[0];
  let result = null;

  function selectMode(nextMode) {
    if (!OUTFIT_COMPATIBILITY_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-outfit-compatibility-mode' };
    }
    mode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const comparison = mode.startsWith('comparison-') || mode === 'none-qualified';
    const evaluated = comparison
      ? compareOutfitCompatibility(comparisonScenario(mode))
      : evaluateOutfitCompatibility(singleScenario(mode));
    if (!evaluated.ok) return evaluated;
    result = {
      kind: comparison ? 'comparison' : 'single',
      data: structuredClone(evaluated.result),
    };
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = OUTFIT_COMPATIBILITY_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      modeSummary: MODE_SUMMARIES[mode],
      supportedModes: [...OUTFIT_COMPATIBILITY_MODES],
      result: structuredClone(result),
      commerceActionsAvailable: false,
      networkActionsAvailable: false,
      privateDataAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
