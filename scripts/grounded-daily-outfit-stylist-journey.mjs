import {
  DAILY_OUTFIT_MODES,
  createDailyOutfitIntentJourney,
} from './daily-outfit-intent-journey.mjs';
import {
  adaptDailyOutfitStylistResponse,
} from './grounded-daily-outfit-stylist.mjs';

export const GROUNDED_DAILY_OUTFIT_STYLIST_MODES = DAILY_OUTFIT_MODES;

function clone(value) {
  return structuredClone(value);
}

export function createGroundedDailyOutfitStylistJourney() {
  const dailyOutfitJourney = createDailyOutfitIntentJourney();
  let response = null;

  function selectMode(mode) {
    const selected = dailyOutfitJourney.selectMode(mode);
    if (!selected.ok) return selected;
    response = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const evaluated = dailyOutfitJourney.run();
    if (!evaluated.ok) return evaluated;
    const adapted = adaptDailyOutfitStylistResponse(evaluated.view.result);
    if (!adapted.ok) return adapted;
    response = clone(adapted.response);
    return { ok: true, view: getView() };
  }

  function reset() {
    dailyOutfitJourney.reset();
    response = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    const source = dailyOutfitJourney.getView();
    return {
      fixtureOnly: true,
      providerMode: 'fixture-only-no-network',
      mode: source.mode,
      modeSummary: source.modeSummary,
      supportedModes: [...GROUNDED_DAILY_OUTFIT_STYLIST_MODES],
      context: clone(source.context),
      response: clone(response),
      liveContextAvailable: false,
      privateDataAvailable: false,
      persistenceAvailable: false,
      providerCallsAvailable: false,
      networkActionsAvailable: false,
      commerceActionsAvailable: false,
      externalActionsAvailable: false,
    };
  }

  return {
    selectMode,
    run,
    reset,
    getView,
  };
}
