import { products as canonicalProducts } from '../data/products.js';
import { offers as canonicalOffers } from '../data/offers.js';
import { products as productFacts } from '../js/products.js';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
} from './__fixtures__/personalization.mjs';
import { compareProspectivePurchases } from './purchase-simulator.mjs';

export const PURCHASE_SIMULATOR_MODES = Object.freeze([
  'best-fit',
  'tie',
  'buy-none',
  'excluded-evidence',
]);
const NOW = '2026-07-26T00:00:00.000Z';

function scenario(mode) {
  if (mode === 'best-fit') {
    return {
      profile: FIXTURE_PROFILE,
      candidateIds: ['adidas-samba-og-b75806', 'birkenstock-boston-taupe'],
    };
  }
  if (mode === 'buy-none') {
    return {
      profile: { ...FIXTURE_PROFILE, avoidedBrands: ['adidas', 'Dickies'] },
      candidateIds: ['adidas-samba-og-b75806', 'dickies-874-dark-navy'],
    };
  }
  if (mode === 'excluded-evidence') {
    return {
      profile: FIXTURE_PROFILE,
      candidateIds: ['adidas-samba-og-b75806', 'birkenstock-boston-taupe'],
      nowIso: '2027-07-26T00:00:00.000Z',
    };
  }
  const source = canonicalProducts.find(({ id }) => id === 'adidas-samba-og-b75806');
  const offer = canonicalOffers.find(({ productId }) => productId === source.id);
  const fact = productFacts.find(({ id }) => id === source.id);
  const candidates = ['candidate-tie-alpha', 'candidate-tie-beta'];
  return {
    profile: FIXTURE_PROFILE,
    candidateIds: candidates,
    catalog: [
      ...canonicalProducts,
      ...candidates.map((id) => ({ ...source, id, name: `Fixture tie option ${id.at(-1)}` })),
    ],
    offers: [...canonicalOffers, ...candidates.map((productId) => ({ ...offer, productId }))],
    facts: [...productFacts, ...candidates.map((id) => ({ ...fact, id }))],
  };
}

export function createPurchaseSimulatorJourney() {
  let mode = PURCHASE_SIMULATOR_MODES[0];
  let result = null;

  function selectMode(nextMode) {
    if (!PURCHASE_SIMULATOR_MODES.includes(nextMode)) {
      return { ok: false, error: 'unsupported-purchase-simulator-mode' };
    }
    mode = nextMode;
    result = null;
    return { ok: true, view: getView() };
  }

  function run() {
    const input = scenario(mode);
    const compared = compareProspectivePurchases({
      profile: input.profile,
      wardrobe: FIXTURE_WARDROBE,
      candidateIds: input.candidateIds,
      nowIso: input.nowIso ?? NOW,
      ...(input.catalog ? { catalog: input.catalog } : {}),
      ...(input.offers ? { offers: input.offers } : {}),
      ...(input.facts ? { facts: input.facts } : {}),
    });
    if (!compared.ok) return compared;
    result = structuredClone(compared.comparison);
    return { ok: true, view: getView() };
  }

  function reset() {
    mode = PURCHASE_SIMULATOR_MODES[0];
    result = null;
    return { ok: true, view: getView() };
  }

  function getView() {
    return {
      fixtureOnly: true,
      mode,
      supportedModes: [...PURCHASE_SIMULATOR_MODES],
      result: structuredClone(result),
      commerceActionsAvailable: false,
    };
  }

  return { selectMode, run, reset, getView };
}
