import { evaluateDailyOutfitIntent } from './daily-outfit-intent-contract.mjs';
import { evaluateOutfitCompatibility } from './outfit-compatibility-contract.mjs';

export const DAILY_OUTFIT_MODES = Object.freeze([
  'ready-two',
  'ready-three',
  'unknown-weather',
  'ambiguous-dress-code',
  'stale-availability',
  'weather-season-conflict',
  'dress-code-occasion-conflict',
  'outfit-set-boundary-tie',
  'insufficient-candidates',
]);

const MODE_SUMMARIES = Object.freeze({
  'ready-two': 'Explicit current context supports two trustworthy, distinct outfits.',
  'ready-three': 'Explicit current context supports a larger three-outfit set.',
  'unknown-weather': 'Unknown weather requires review instead of invented conditions.',
  'ambiguous-dress-code': 'An ambiguous dress code stays unresolved.',
  'stale-availability': 'Stale item availability must be refreshed before recommendation.',
  'weather-season-conflict': 'Conflicting weather and season evidence causes abstention.',
  'dress-code-occasion-conflict': 'A formal dress code conflicts with the everyday occasion.',
  'outfit-set-boundary-tie': 'An exact Outfit Set boundary tie remains review-required.',
  'insufficient-candidates': 'One qualified outfit cannot become a complete daily set.',
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

function item(seed, role, overrides = {}) {
  return {
    itemId: `${seed}-${role}`,
    productId: `fixture-${seed}-${role}`,
    ownership: 'owned',
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
    fitStatus: 'verified',
    ...overrides,
  };
}

function compatibility(outfitId, overrides = {}) {
  return evaluateOutfitCompatibility({
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
  }).result;
}

function candidate(candidateId, overrides = {}) {
  return {
    candidateId,
    compatibility: compatibility(candidateId),
    formula: {
      silhouette: `${candidateId}-silhouette`,
      palette: `${candidateId}-palette`,
      layering: `${candidateId}-layering`,
      formality: `${candidateId}-formality`,
      occasionExecution: `${candidateId}-execution`,
    },
    ...overrides,
  };
}

function blockedCompatibility(outfitId) {
  return compatibility(outfitId, {
    styleSignals: [signal('palette', 'navy', { sentiment: 'negative' })],
  });
}

function scenario(mode) {
  const base = {
    occasion: 'everyday',
    seasonClass: 'transitional',
    weatherClass: 'dry',
    dressCode: 'smart-casual',
    availabilityWindow: 'today',
    desiredCount: 2,
    candidates: [candidate('look-one'), candidate('look-two')],
  };
  if (mode === 'ready-three') {
    return {
      ...base,
      desiredCount: 3,
      candidates: [candidate('look-one'), candidate('look-two'), candidate('look-three')],
    };
  }
  if (mode === 'unknown-weather') return { ...base, weatherClass: 'unknown' };
  if (mode === 'ambiguous-dress-code') return { ...base, dressCode: 'ambiguous' };
  if (mode === 'stale-availability') return { ...base, availabilityWindow: 'stale' };
  if (mode === 'weather-season-conflict') {
    return { ...base, seasonClass: 'warm', weatherClass: 'cold' };
  }
  if (mode === 'dress-code-occasion-conflict') {
    return { ...base, dressCode: 'formal' };
  }
  if (mode === 'outfit-set-boundary-tie') {
    return {
      ...base,
      candidates: [candidate('look-one'), candidate('look-two'), candidate('look-three')],
    };
  }
  if (mode === 'insufficient-candidates') {
    return {
      ...base,
      candidates: [
        candidate('look-one'),
        candidate('look-blocked', {
          compatibility: blockedCompatibility('look-blocked'),
        }),
      ],
    };
  }
  return base;
}

function minimizedContext(selected) {
  return {
    occasion: selected.occasion,
    seasonClass: selected.seasonClass,
    weatherClass: selected.weatherClass,
    dressCode: selected.dressCode,
    availabilityWindow: selected.availabilityWindow,
    desiredCount: selected.desiredCount,
  };
}

export function createDailyOutfitIntentJourney() {
  let mode = DAILY_OUTFIT_MODES[0];
  let context = minimizedContext(scenario(mode));
  let result = null;

  function selectMode(nextMode) {
    if (!DAILY_OUTFIT_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-daily-outfit-mode' };
    }
    mode = nextMode;
    context = minimizedContext(scenario(mode));
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const selected = scenario(mode);
    const evaluated = evaluateDailyOutfitIntent({
      requestId: `fixture-${mode}`,
      evidenceVersion: 1,
      ...selected,
    });
    if (!evaluated.ok) return evaluated;
    result = structuredClone(evaluated.result);
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = DAILY_OUTFIT_MODES[0];
    context = minimizedContext(scenario(mode));
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      modeSummary: MODE_SUMMARIES[mode],
      supportedModes: [...DAILY_OUTFIT_MODES],
      context: structuredClone(context),
      result: structuredClone(result),
      liveContextAvailable: false,
      privateDataAvailable: false,
      persistenceAvailable: false,
      networkActionsAvailable: false,
      commerceActionsAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
