import { evaluateDailyOutfitIntent } from './daily-outfit-intent-contract.mjs';
import { adaptDailyOutfitStylistResponse } from './grounded-daily-outfit-stylist.mjs';
import { evaluateOutfitCompatibility } from './outfit-compatibility-contract.mjs';

export const DAILY_OUTFIT_STYLIST_COMPOSER_VERSION = 'daily-outfit-stylist-composer-v1';

export const COMPOSER_OCCASIONS = Object.freeze([
  'everyday', 'work', 'dinner', 'travel', 'weekend', 'event',
]);
export const COMPOSER_SEASON_CLASSES = Object.freeze([
  'warm', 'cold', 'transitional', 'unknown',
]);
export const COMPOSER_WEATHER_CLASSES = Object.freeze([
  'dry', 'rain', 'heat', 'cold', 'variable', 'unknown',
]);
export const COMPOSER_DRESS_CODES = Object.freeze([
  'casual', 'smart-casual', 'business-casual', 'formal', 'ambiguous',
]);
export const COMPOSER_AVAILABILITY_WINDOWS = Object.freeze([
  'now', 'today', 'this-week', 'stale', 'unknown',
]);
export const COMPOSER_DESIRED_COUNTS = Object.freeze([2, 3]);

const DEFAULT_CONTEXT = Object.freeze({
  occasion: 'everyday',
  seasonClass: 'transitional',
  weatherClass: 'dry',
  dressCode: 'smart-casual',
  availabilityWindow: 'today',
  desiredCount: 2,
});

const FIELD_DOMAINS = Object.freeze({
  occasion: COMPOSER_OCCASIONS,
  seasonClass: COMPOSER_SEASON_CLASSES,
  weatherClass: COMPOSER_WEATHER_CLASSES,
  dressCode: COMPOSER_DRESS_CODES,
  availabilityWindow: COMPOSER_AVAILABILITY_WINDOWS,
  desiredCount: COMPOSER_DESIRED_COUNTS,
});

// One closed, deterministic synthetic candidate — not the person's real
// wardrobe — per missing style dimension. Missing a dimension entirely
// (rather than partially) keeps every resulting compatibility score distinct
// so outfit-set selection never depends on tie-breaking policy this composer
// does not own.
const CANDIDATE_PLAN = Object.freeze([
  { candidateId: 'capsule-signature', missingDimension: null },
  { candidateId: 'capsule-layered', missingDimension: 'layering' },
  { candidateId: 'capsule-weekend', missingDimension: 'material' },
  { candidateId: 'capsule-transit', missingDimension: 'palette' },
]);

const NEXT_STEP_CLARIFICATIONS = Object.freeze({
  'review-tied-outfits':
    'Two or more synthetic outfits are exactly tied for the last open slot. Review the tied outfits below and choose one yourself.',
  'confirm-more-current-available-outfits':
    'Fewer trustworthy synthetic outfits qualified than the outfit count you chose. Lower the count or confirm more available outfits.',
  'review-outfit-evidence':
    'No synthetic outfit currently qualifies. Review the evidence for each excluded outfit before trying again.',
  'confirm-explicit-context':
    'One of your explicit selections is unknown, ambiguous, or stale. Confirm it, then generate again.',
  'resolve-context-conflict':
    'Two of your explicit selections conflict with each other. Resolve the conflict, then generate again.',
});

function clone(value) {
  return structuredClone(value);
}

function styleSignal(dimension, value) {
  return {
    dimension,
    value,
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'explicit-user-selection',
  };
}

function poolItem(candidateId, role, flags) {
  return {
    itemId: `${candidateId}-${role}`,
    productId: `fixture-synthetic-${candidateId}-${role}`,
    ownership: 'owned',
    role,
    evidenceState: 'current',
    aesthetics: ['minimal'],
    palette: [flags.palette ? 'navy' : 'coral'],
    silhouette: flags.silhouette ? 'relaxed' : 'boxy',
    formality: flags.formality ? 'smart-casual' : 'formal',
    materials: [flags.material ? 'cotton' : 'polyester'],
    occasions: [...COMPOSER_OCCASIONS],
    seasons: ['transitional'],
    layering: role === 'outerwear' ? (flags.layering ? 'outer-layer' : 'mid-layer') : 'base',
    riskLevel: 'balanced',
    fitStatus: 'verified',
  };
}

function poolCandidate({ candidateId, missingDimension }, occasion, evidenceVersion) {
  const flags = { palette: true, silhouette: true, formality: true, material: true, layering: true };
  if (missingDimension) flags[missingDimension] = false;
  const items = ['top', 'bottom', 'footwear', 'outerwear'].map(
    (role) => poolItem(candidateId, role, flags),
  );
  const compatibility = evaluateOutfitCompatibility({
    outfitId: candidateId,
    evidenceVersion,
    styleDnaVersion: 'style-dna-v1',
    styleSignals: [
      styleSignal('palette', 'navy'),
      styleSignal('silhouette', 'relaxed'),
      styleSignal('formality', 'smart-casual'),
      styleSignal('material', 'cotton'),
      styleSignal('layering', 'outer-layer'),
    ],
    target: { occasion, season: 'transitional' },
    items,
  }).result;
  return {
    candidateId,
    compatibility,
    formula: {
      silhouette: `${candidateId}-silhouette`,
      palette: `${candidateId}-palette`,
      layering: `${candidateId}-layering`,
      formality: `${candidateId}-formality`,
      occasionExecution: `${candidateId}-execution`,
    },
  };
}

function syntheticCandidatePool(occasion, evidenceVersion) {
  return CANDIDATE_PLAN.map((plan) => poolCandidate(plan, occasion, evidenceVersion));
}

function isValidField(field, value) {
  return Object.prototype.hasOwnProperty.call(FIELD_DOMAINS, field)
    && FIELD_DOMAINS[field].includes(value);
}

function clarificationPromptFor(response) {
  if (response.outcome === 'answer') return null;
  const base = NEXT_STEP_CLARIFICATIONS[response.nextStep]
    ?? 'Review the reasons above, then generate again.';
  return `${base} Reason codes: ${response.reasonCodes.join(', ')}.`;
}

export function createDailyOutfitStylistComposer() {
  let context = { ...DEFAULT_CONTEXT };
  let response = null;
  let clarificationPrompt = null;

  function selectField(field, value) {
    if (!isValidField(field, value)) {
      return { ok: false, error: 'unsupported-daily-outfit-stylist-composer-field' };
    }
    context = { ...context, [field]: value };
    response = null;
    clarificationPrompt = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const evaluated = evaluateDailyOutfitIntent({
      requestId: 'daily-outfit-stylist-composer-fixture',
      evidenceVersion: 1,
      ...context,
      candidates: syntheticCandidatePool(context.occasion, 1),
    });
    if (!evaluated.ok) return evaluated;
    const adapted = adaptDailyOutfitStylistResponse(evaluated.result);
    if (!adapted.ok) return adapted;
    response = clone(adapted.response);
    clarificationPrompt = clarificationPromptFor(response);
    return { ok: true, view: getView() };
  }

  function reset() {
    context = { ...DEFAULT_CONTEXT };
    response = null;
    clarificationPrompt = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      providerMode: 'fixture-only-no-network',
      context: clone(context),
      allowlist: {
        occasion: [...COMPOSER_OCCASIONS],
        seasonClass: [...COMPOSER_SEASON_CLASSES],
        weatherClass: [...COMPOSER_WEATHER_CLASSES],
        dressCode: [...COMPOSER_DRESS_CODES],
        availabilityWindow: [...COMPOSER_AVAILABILITY_WINDOWS],
        desiredCount: [...COMPOSER_DESIRED_COUNTS],
      },
      response: clone(response),
      clarificationPrompt,
      candidatePoolSize: CANDIDATE_PLAN.length,
      candidatePoolIsSynthetic: true,
      liveContextAvailable: false,
      privateDataAvailable: false,
      persistenceAvailable: false,
      providerCallsAvailable: false,
      networkActionsAvailable: false,
      commerceActionsAvailable: false,
      externalActionsAvailable: false,
    };
  }

  return { selectField, run, reset, getView };
}
