import { evaluateOutfitCompatibility } from './outfit-compatibility-contract.mjs';
import { recommendOutfitSet } from './outfit-set-recommendation-contract.mjs';

export const OUTFIT_SET_MODES = Object.freeze([
  'two-outfit-set',
  'three-outfit-set',
  'owned-first',
  'duplicate-formula',
  'boundary-tie',
  'insufficient-candidates',
  'none-qualified',
  'stale-evidence',
]);

const MODE_SUMMARIES = Object.freeze({
  'two-outfit-set': 'Two trustworthy, distinct outfits form a complete recommendation set.',
  'three-outfit-set': 'Three trustworthy formulas satisfy the larger requested set.',
  'owned-first': 'Owned pieces win only inside the same compatibility quality band.',
  'duplicate-formula': 'Repeated formulas are excluded instead of inflating variety.',
  'boundary-tie': 'An exact tie crossing the final slot remains reviewable.',
  'insufficient-candidates': 'One qualified outfit cannot be inflated into a complete set.',
  'none-qualified': 'When every candidate fails a trust gate, the system abstains.',
  'stale-evidence': 'Stale product evidence remains visible and excluded.',
});

function signal(dimension, value, overrides = {}) {
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

function item(seed, role, ownership = 'owned', overrides = {}) {
  return {
    itemId: `${seed}-${role}`,
    productId: `fixture-${seed}-${role}`,
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

function compatibility(outfitId, overrides = {}) {
  const input = {
    outfitId,
    evidenceVersion: 1,
    styleDnaVersion: 'style-dna-v1',
    styleSignals: [
      signal('palette', 'navy'),
      signal('silhouette', 'relaxed'),
      signal('formality', 'smart-casual'),
      signal('material', 'cotton'),
      signal('layering', 'outer-layer'),
    ],
    target: { occasion: 'everyday', season: 'transitional' },
    items: [
      item(outfitId, 'top'),
      item(outfitId, 'bottom'),
      item(outfitId, 'footwear'),
      item(outfitId, 'outerwear'),
    ],
    ...overrides,
  };
  return evaluateOutfitCompatibility(input).result;
}

function formula(seed, overrides = {}) {
  return {
    silhouette: `${seed}-silhouette`,
    palette: `${seed}-palette`,
    layering: `${seed}-layering`,
    formality: `${seed}-formality`,
    occasionExecution: `${seed}-execution`,
    ...overrides,
  };
}

function candidate(candidateId, overrides = {}) {
  return {
    candidateId,
    compatibility: compatibility(candidateId),
    formula: formula(candidateId),
    ...overrides,
  };
}

function blockedCompatibility(outfitId) {
  return compatibility(outfitId, {
    styleSignals: [
      signal('palette', 'navy', { sentiment: 'negative' }),
    ],
  });
}

function scenario(mode) {
  if (mode === 'three-outfit-set') {
    return {
      desiredCount: 3,
      candidates: [candidate('look-one'), candidate('look-two'), candidate('look-three')],
    };
  }
  if (mode === 'owned-first') {
    const prospective = compatibility('look-prospective', {
      items: [
        item('prospective', 'top'),
        item('prospective', 'bottom'),
        item('prospective', 'footwear', 'prospective'),
        item('prospective', 'outerwear'),
      ],
    });
    return {
      desiredCount: 2,
      candidates: [
        candidate('look-owned-one', {
          compatibility: { ...compatibility('look-owned-one'), score: 92 },
        }),
        candidate('look-owned-two', {
          compatibility: { ...compatibility('look-owned-two'), score: 91 },
        }),
        candidate('look-prospective', {
          compatibility: { ...prospective, score: 94 },
        }),
      ],
    };
  }
  if (mode === 'duplicate-formula') {
    const repeated = formula('repeated');
    return {
      desiredCount: 2,
      candidates: [
        candidate('look-duplicate-one', { formula: repeated }),
        candidate('look-duplicate-two', { formula: repeated }),
        candidate('look-distinct'),
      ],
    };
  }
  if (mode === 'boundary-tie') {
    return {
      desiredCount: 2,
      candidates: [candidate('look-one'), candidate('look-two'), candidate('look-three')],
    };
  }
  if (mode === 'insufficient-candidates') {
    return {
      desiredCount: 2,
      candidates: [
        candidate('look-one'),
        candidate('look-blocked', { compatibility: blockedCompatibility('look-blocked') }),
      ],
    };
  }
  if (mode === 'none-qualified') {
    return {
      desiredCount: 2,
      candidates: [
        candidate('look-blocked-one', {
          compatibility: blockedCompatibility('look-blocked-one'),
        }),
        candidate('look-blocked-two', {
          compatibility: blockedCompatibility('look-blocked-two'),
        }),
      ],
    };
  }
  if (mode === 'stale-evidence') {
    const stale = compatibility('look-stale', {
      items: [
        item('stale', 'top'),
        item('stale', 'bottom', 'owned', { evidenceState: 'stale' }),
        item('stale', 'footwear'),
        item('stale', 'outerwear'),
      ],
    });
    return {
      desiredCount: 2,
      candidates: [
        candidate('look-one'),
        candidate('look-stale', { compatibility: stale }),
      ],
    };
  }
  return {
    desiredCount: 2,
    candidates: [
      candidate('look-owned'),
      candidate('look-mixed', {
        compatibility: compatibility('look-mixed', {
          items: [
            item('mixed', 'top'),
            item('mixed', 'bottom'),
            item('mixed', 'footwear', 'prospective'),
            item('mixed', 'outerwear'),
          ],
        }),
      }),
    ],
  };
}

export function createOutfitSetRecommendationJourney() {
  let mode = OUTFIT_SET_MODES[0];
  let result = null;

  function selectMode(nextMode) {
    if (!OUTFIT_SET_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-outfit-set-mode' };
    }
    mode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const selected = scenario(mode);
    const recommended = recommendOutfitSet({
      requestId: `fixture-${mode}`,
      evidenceVersion: 1,
      intent: 'everyday',
      desiredCount: selected.desiredCount,
      candidates: selected.candidates,
    });
    if (!recommended.ok) return recommended;
    result = structuredClone(recommended.result);
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = OUTFIT_SET_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      modeSummary: MODE_SUMMARIES[mode],
      supportedModes: [...OUTFIT_SET_MODES],
      result: structuredClone(result),
      privateDataAvailable: false,
      networkActionsAvailable: false,
      commerceActionsAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
