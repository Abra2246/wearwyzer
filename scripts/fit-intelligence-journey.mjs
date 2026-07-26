import { recommendFixtureFit } from './fit-intelligence-contract.mjs';

export const FIT_INTELLIGENCE_MODES = Object.freeze([
  'verified-transfer',
  'correction-precedence',
  'low-confidence',
  'stale-evidence',
  'conflicting-corrections',
  'unavailable-size',
]);

const NOW = '2026-07-26T00:00:00.000Z';
const BASE_PROFILE = Object.freeze({
  profileVersion: 1,
  category: 'top',
  targetFit: 'relaxed',
  usualSize: Object.freeze({ system: 'alpha', value: 'M' }),
  knownBrandFits: Object.freeze([]),
});
const BASE_EVIDENCE = Object.freeze({
  evidenceVersion: 1,
  productId: 'fixture-overshirt',
  brandId: 'fixture-brand',
  category: 'top',
  state: 'current',
  verifiedAtIso: '2026-07-20T00:00:00.000Z',
  sizeSystem: 'alpha',
  availableSizes: Object.freeze(['S', 'M', 'L', 'XL']),
  fitTendency: 'runs-small',
  regionalConversions: Object.freeze({
    M: Object.freeze({ US: 'M', EU: '48' }),
    L: Object.freeze({ US: 'L', EU: '50' }),
  }),
});

function knownFit(itemId, size) {
  return {
    itemId,
    brandId: 'fixture-brand',
    category: 'top',
    sizeSystem: 'alpha',
    size,
    outcome: 'as-preferred',
    source: 'explicit-correction',
  };
}

function scenario(mode) {
  if (mode === 'correction-precedence') {
    return {
      profile: { ...BASE_PROFILE, knownBrandFits: [knownFit('owned-fixture-overshirt', 'M')] },
      productEvidence: BASE_EVIDENCE,
    };
  }
  if (mode === 'low-confidence') {
    return {
      profile: BASE_PROFILE,
      productEvidence: { ...BASE_EVIDENCE, fitTendency: 'unknown' },
    };
  }
  if (mode === 'stale-evidence') {
    return {
      profile: BASE_PROFILE,
      productEvidence: { ...BASE_EVIDENCE, verifiedAtIso: '2026-05-01T00:00:00.000Z' },
    };
  }
  if (mode === 'conflicting-corrections') {
    return {
      profile: {
        ...BASE_PROFILE,
        knownBrandFits: [
          knownFit('owned-fixture-overshirt-one', 'M'),
          knownFit('owned-fixture-overshirt-two', 'L'),
        ],
      },
      productEvidence: BASE_EVIDENCE,
    };
  }
  if (mode === 'unavailable-size') {
    return {
      profile: BASE_PROFILE,
      productEvidence: {
        ...BASE_EVIDENCE,
        availableSizes: ['S', 'M', 'XL'],
        regionalConversions: { M: { US: 'M', EU: '48' } },
      },
    };
  }
  return { profile: BASE_PROFILE, productEvidence: BASE_EVIDENCE };
}

export function createFitIntelligenceJourney() {
  let mode = FIT_INTELLIGENCE_MODES[0];
  let result = null;

  function selectMode(nextMode) {
    if (!FIT_INTELLIGENCE_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-fit-intelligence-mode' };
    }
    mode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const input = scenario(mode);
    const guidance = recommendFixtureFit({ ...input, nowIso: NOW });
    if (!guidance.ok) return guidance;
    result = structuredClone(guidance.result);
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = FIT_INTELLIGENCE_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      supportedModes: [...FIT_INTELLIGENCE_MODES],
      result: structuredClone(result),
      commerceActionsAvailable: false,
      sensitiveInputCollectionAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
