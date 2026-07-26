import { FIXTURE_WARDROBE } from './__fixtures__/personalization.mjs';
import { scoreClosetHealth } from './closet-health-score.mjs';

export const CLOSET_HEALTH_MODES = Object.freeze([
  'complete-evidence',
  'missing-wear-evidence',
  'care-needed',
  'correction-needed',
]);

const BASE_WARDROBE = Object.freeze(FIXTURE_WARDROBE.map(({ id, productId }) => Object.freeze({
  itemId: id,
  productId,
  confirmedExact: true,
})));

function wear(itemId, overrides = {}) {
  return {
    itemId,
    lifecycleVersion: 2,
    wearState: 'active',
    wearCountBucket: '5-14',
    recencyBucket: '0-30-days',
    condition: 'good',
    ...overrides,
  };
}

function scenario(mode) {
  if (mode === 'missing-wear-evidence') {
    return { wardrobeItems: BASE_WARDROBE, wearEvidence: [] };
  }
  if (mode === 'care-needed') {
    return {
      wardrobeItems: BASE_WARDROBE,
      wearEvidence: [
        wear(BASE_WARDROBE[0].itemId, {
          wearState: 'forgotten',
          wearCountBucket: '5-14',
          recencyBucket: '181+-days',
        }),
        wear(BASE_WARDROBE[1].itemId, {
          wearState: 'never-worn',
          wearCountBucket: '0',
          recencyBucket: 'never',
        }),
        wear(BASE_WARDROBE[2].itemId, { condition: 'repair-needed' }),
        ...BASE_WARDROBE.slice(3).map(({ itemId }) => wear(itemId)),
      ],
    };
  }
  if (mode === 'correction-needed') {
    const duplicate = {
      itemId: 'owned-cream-tee-two',
      productId: 'cream-tee',
      confirmedExact: true,
    };
    const unresolved = {
      itemId: 'owned-unresolved-item',
      productId: 'fixture-unresolved-product',
      confirmedExact: true,
    };
    const wardrobeItems = [...BASE_WARDROBE, duplicate, unresolved];
    return {
      wardrobeItems,
      wearEvidence: wardrobeItems.map(({ itemId }) => wear(itemId)),
    };
  }
  return {
    wardrobeItems: BASE_WARDROBE,
    wearEvidence: BASE_WARDROBE.map(({ itemId }) => wear(itemId)),
  };
}

export function createClosetHealthJourney() {
  let mode = CLOSET_HEALTH_MODES[0];
  let result = null;

  function selectMode(nextMode) {
    if (!CLOSET_HEALTH_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-closet-health-mode' };
    }
    mode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const scored = scoreClosetHealth(scenario(mode));
    if (!scored.ok) return scored;
    result = structuredClone(scored.health);
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = CLOSET_HEALTH_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      supportedModes: [...CLOSET_HEALTH_MODES],
      result: structuredClone(result),
      commerceActionsAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
