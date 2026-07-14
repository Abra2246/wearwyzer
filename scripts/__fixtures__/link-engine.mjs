// Deterministic fixture universe for the verified supporting-item link
// engine v1 (issue #24, scripts/link-engine*.mjs). Every intended item,
// listing, and adapter here is invented specifically for this fixture —
// none of it is written into data/products.js, data/offers.js, or any
// live page, matching the same isolated-fixture-universe approach
// scripts/__fixtures__/guide-jobs.mjs already uses for the guide factory.
//
// Covers every scenario this issue's acceptance criteria and trigger
// comment name: exact match, ambiguity, no-match, redirect, stale price
// (via isStale), out of stock, dead link, duplicate offer, affiliate
// eligibility loss, alternative substitution (both fresh-run and
// revalidation-triggered), and threshold/coverage calculation.

import { createFixtureAdapter } from '../link-engine-adapters.mjs';
import { verifyOffer } from '../link-engine-verifier.mjs';

export const FIXTURE_NOW = '2026-07-14T00:00:00.000Z';
export const FIXTURE_LATER = '2026-08-05T00:00:00.000Z'; // 22 days later — past the 14-day default staleness window

// -- intended items (outfit supporting-item references) ---------------------

export const EXACT_MATCH_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-1--0',
  productId: 'fx-belt',
  label: 'Brown leather belt',
  brand: 'Trellis Goods',
  name: 'Classic Leather Belt',
  category: 'belts',
  color: 'brown',
  material: 'leather',
  gender: 'men',
  canonicalId: 'TG-BELT-001',
  priceTier: 'mid',
});

export const AMBIGUOUS_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-1--1',
  productId: 'fx-scarf',
  label: 'Wool scarf',
  brand: 'Northfield',
  name: 'Merino Wool Scarf',
  category: 'scarves',
  color: 'grey',
  material: 'wool',
  gender: 'unisex',
  canonicalId: null,
  priceTier: 'mid',
});

export const NO_MATCH_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-1--2',
  productId: null,
  label: 'Rare vintage brooch',
  brand: 'Unknown Vintage Co',
  name: 'Antique Brooch',
  category: 'accessories',
  color: null,
  material: null,
  gender: 'unisex',
  canonicalId: null,
  priceTier: null,
});

export const DEAD_LINK_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-2--0',
  productId: 'fx-cap',
  label: 'Canvas cap',
  brand: 'Fieldwear',
  name: 'Waxed Canvas Cap',
  category: 'hats',
  color: 'olive',
  material: null,
  gender: 'men',
  canonicalId: 'FW-CAP-014',
  priceTier: 'mid',
});

export const OUT_OF_STOCK_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-2--1',
  productId: 'fx-gloves',
  label: 'Leather gloves',
  brand: 'Fieldwear',
  name: 'Cordovan Leather Gloves',
  category: 'gloves',
  color: null,
  material: 'leather',
  gender: 'men',
  canonicalId: 'FW-GLV-007',
  priceTier: 'mid',
});

export const REDIRECT_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-2--2',
  productId: 'fx-tie',
  label: 'Silk tie',
  brand: 'Bellrose',
  name: 'Navy Silk Tie',
  category: 'ties',
  color: 'navy',
  material: 'silk',
  gender: 'men',
  canonicalId: 'BR-TIE-002',
  priceTier: 'mid',
});

export const AFFILIATE_LOSS_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-2--3',
  productId: 'fx-watch',
  label: 'Field watch',
  brand: 'Solence',
  name: 'Field Chronograph',
  category: 'watches',
  color: null,
  material: null,
  gender: 'unisex',
  canonicalId: 'SOL-WCH-100',
  priceTier: 'premium',
});

export const LINER_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-2--4',
  productId: 'fx-liner',
  label: 'Quilted jacket liner',
  brand: 'Palmerston',
  name: 'Quilted Zip Liner',
  category: 'liners',
  color: null,
  material: null,
  gender: 'unisex',
  canonicalId: 'PLM-LIN-009',
  priceTier: 'mid',
});

export const DIRECT_BRAND_ITEM = Object.freeze({
  outfitItemId: 'fx-outfit-4--0',
  productId: 'fx-jacket',
  label: 'Waxed field jacket',
  brand: 'Harbor & Bell',
  name: 'Waxed Field Jacket',
  category: 'jackets',
  color: null,
  material: null,
  gender: 'men',
  canonicalId: 'HRB-JKT-300',
  priceTier: 'premium',
});

export const DUP_ITEM_A = Object.freeze({
  outfitItemId: 'fx-outfit-3--0',
  productId: 'fx-sunglasses-a',
  label: 'Aviator sunglasses',
  brand: 'Solence',
  name: 'Classic Aviator',
  category: 'eyewear',
  color: null,
  material: null,
  gender: 'unisex',
  canonicalId: 'SOL-EYE-050',
  priceTier: 'mid',
});

export const DUP_ITEM_B = Object.freeze({
  outfitItemId: 'fx-outfit-3--1',
  productId: 'fx-sunglasses-b',
  label: 'Aviator sunglasses (second slot)',
  brand: 'Solence',
  name: 'Classic Aviator',
  category: 'eyewear',
  color: null,
  material: null,
  gender: 'unisex',
  canonicalId: 'SOL-EYE-050',
  priceTier: 'mid',
});

// -- initial ("now") listings, by adapter ------------------------------------

const RETAILER_LISTINGS_INITIAL = [
  {
    listingId: 'rt-belt-001',
    brand: 'Trellis Goods',
    name: 'Classic Leather Belt',
    title: 'Classic Leather Belt - Brown',
    category: 'belts',
    color: 'brown',
    material: 'leather',
    gender: 'men',
    canonicalId: 'TG-BELT-001',
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/classic-leather-belt',
    affiliateUrl: 'https://example-retailer.test/aff/classic-leather-belt?ref=wearwyzer',
    price: 58,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
  {
    listingId: 'rt-scarf-classic',
    brand: 'Northfield',
    name: 'Merino Wool Scarf - Classic',
    title: 'Merino Wool Scarf - Classic',
    category: 'scarves',
    color: 'grey',
    material: 'wool',
    gender: 'unisex',
    canonicalId: null,
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/merino-scarf-classic',
    affiliateUrl: 'https://example-retailer.test/aff/merino-scarf-classic?ref=wearwyzer',
    price: 45,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
  {
    listingId: 'rt-cap-broken',
    brand: 'Fieldwear',
    name: 'Waxed Canvas Cap',
    title: 'Waxed Canvas Cap',
    category: 'hats',
    color: 'olive',
    material: null,
    gender: 'men',
    canonicalId: 'FW-CAP-014',
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/waxed-canvas-cap',
    affiliateUrl: 'https://example-retailer.test/aff/waxed-canvas-cap?ref=wearwyzer',
    price: 32,
    currency: 'USD',
    httpStatus: 404,
    redirectTo: null,
    stock: 'unknown',
    affiliateEligible: true,
    priceTier: 'mid',
  },
  {
    listingId: 'rt-cap-alt',
    brand: 'Northfield',
    name: 'Wool Trapper Hat',
    title: 'Wool Trapper Hat',
    category: 'hats',
    color: 'charcoal',
    material: 'wool',
    gender: 'men',
    canonicalId: null,
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/wool-trapper-hat',
    affiliateUrl: 'https://example-retailer.test/aff/wool-trapper-hat?ref=wearwyzer',
    price: 39,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
  {
    listingId: 'rt-gloves-001',
    brand: 'Fieldwear',
    name: 'Cordovan Leather Gloves',
    title: 'Cordovan Leather Gloves',
    category: 'gloves',
    color: null,
    material: 'leather',
    gender: 'men',
    canonicalId: 'FW-GLV-007',
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/cordovan-gloves',
    affiliateUrl: 'https://example-retailer.test/aff/cordovan-gloves?ref=wearwyzer',
    price: 68,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'out_of_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
  {
    listingId: 'rt-tie-001',
    brand: 'Bellrose',
    name: 'Navy Silk Tie',
    title: 'Navy Silk Tie',
    category: 'ties',
    color: 'navy',
    material: 'silk',
    gender: 'men',
    canonicalId: 'BR-TIE-002',
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/navy-silk-tie',
    affiliateUrl: 'https://example-retailer.test/aff/navy-silk-tie?ref=wearwyzer',
    price: 29,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
  {
    listingId: 'rt-watch-001',
    brand: 'Solence',
    name: 'Field Chronograph',
    title: 'Field Chronograph',
    category: 'watches',
    color: null,
    material: null,
    gender: 'unisex',
    canonicalId: 'SOL-WCH-100',
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/field-chronograph',
    affiliateUrl: 'https://example-retailer.test/aff/field-chronograph?ref=wearwyzer',
    price: 210,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'premium',
  },
  {
    listingId: 'rt-liner-001',
    brand: 'Palmerston',
    name: 'Quilted Zip Liner',
    title: 'Quilted Zip Liner',
    category: 'liners',
    color: null,
    material: null,
    gender: 'unisex',
    canonicalId: 'PLM-LIN-009',
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/quilted-zip-liner',
    affiliateUrl: 'https://example-retailer.test/aff/quilted-zip-liner?ref=wearwyzer',
    price: 54,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
  {
    listingId: 'rt-sunglasses-050',
    brand: 'Solence',
    name: 'Classic Aviator',
    title: 'Classic Aviator',
    category: 'eyewear',
    color: null,
    material: null,
    gender: 'unisex',
    canonicalId: 'SOL-EYE-050',
    image: null,
    retailerName: 'Fieldstone Supply Co.',
    canonicalUrl: null,
    retailerUrl: 'https://example-retailer.test/p/classic-aviator',
    affiliateUrl: 'https://example-retailer.test/aff/classic-aviator?ref=wearwyzer',
    price: 88,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
];

const BRAND_LISTINGS_INITIAL = [
  {
    listingId: 'bd-jacket-001',
    brand: 'Harbor & Bell',
    name: 'Waxed Field Jacket',
    title: 'Waxed Field Jacket',
    category: 'jackets',
    color: null,
    material: null,
    gender: 'men',
    canonicalId: 'HRB-JKT-300',
    image: null,
    retailerName: 'Harbor & Bell (direct)',
    canonicalUrl: 'https://harborandbell.test/products/waxed-field-jacket',
    retailerUrl: 'https://harborandbell.test/products/waxed-field-jacket',
    affiliateUrl: null,
    price: 245,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: false,
    priceTier: 'premium',
  },
];

const FEED_LISTINGS_INITIAL = [
  {
    listingId: 'pf-scarf-ribbed',
    brand: 'Northfield',
    name: 'Merino Wool Scarf - Ribbed',
    title: 'Merino Wool Scarf - Ribbed',
    category: 'scarves',
    color: 'grey',
    material: 'wool',
    gender: 'unisex',
    canonicalId: null,
    image: null,
    retailerName: 'StyleFeed Marketplace',
    canonicalUrl: null,
    retailerUrl: 'https://example-feed.test/p/merino-scarf-ribbed',
    affiliateUrl: 'https://example-feed.test/aff/merino-scarf-ribbed?ref=wearwyzer',
    price: 47,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
];

export const RETAILER_ADAPTER = createFixtureAdapter({
  id: 'retailer-fixture',
  kind: 'retailer',
  name: 'Fieldstone Supply Co. (fixture)',
  listings: RETAILER_LISTINGS_INITIAL,
});

export const BRAND_ADAPTER = createFixtureAdapter({
  id: 'brand-site-fixture',
  kind: 'brand-site',
  name: 'Harbor & Bell direct (fixture)',
  listings: BRAND_LISTINGS_INITIAL,
});

export const FEED_ADAPTER = createFixtureAdapter({
  id: 'product-feed-fixture',
  kind: 'product-feed',
  name: 'StyleFeed Marketplace (fixture)',
  listings: FEED_LISTINGS_INITIAL,
});

export const INITIAL_ADAPTERS = Object.freeze([RETAILER_ADAPTER, BRAND_ADAPTER, FEED_ADAPTER]);

// -- later ("revalidation run") listings — same listingIds, changed facts ---

const RETAILER_LISTINGS_LATER = RETAILER_LISTINGS_INITIAL.map((listing) => {
  if (listing.listingId === 'rt-belt-001') {
    return { ...listing, httpStatus: 410, redirectTo: null, retailerUrl: null };
  }
  if (listing.listingId === 'rt-tie-001') {
    return { ...listing, httpStatus: 301, redirectTo: 'https://example-retailer.test/p/navy-silk-tie-v2' };
  }
  if (listing.listingId === 'rt-watch-001') {
    return { ...listing, affiliateEligible: false, affiliateUrl: null };
  }
  if (listing.listingId === 'rt-liner-001') {
    return { ...listing, stock: 'out_of_stock' };
  }
  return listing;
});

const FEED_LISTINGS_LATER = [
  ...FEED_LISTINGS_INITIAL,
  {
    listingId: 'pf-liner-alt',
    brand: 'Anders & Co',
    name: 'Fleece Zip Liner',
    title: 'Fleece Zip Liner',
    category: 'liners',
    color: null,
    material: 'fleece',
    gender: 'unisex',
    canonicalId: null,
    image: null,
    retailerName: 'StyleFeed Marketplace',
    canonicalUrl: null,
    retailerUrl: 'https://example-feed.test/p/fleece-zip-liner',
    affiliateUrl: 'https://example-feed.test/aff/fleece-zip-liner?ref=wearwyzer',
    price: 49,
    currency: 'USD',
    httpStatus: 200,
    redirectTo: null,
    stock: 'in_stock',
    affiliateEligible: true,
    priceTier: 'mid',
  },
];

export const RETAILER_ADAPTER_LATER = createFixtureAdapter({
  id: 'retailer-fixture',
  kind: 'retailer',
  name: 'Fieldstone Supply Co. (fixture)',
  listings: RETAILER_LISTINGS_LATER,
});

export const FEED_ADAPTER_LATER = createFixtureAdapter({
  id: 'product-feed-fixture',
  kind: 'product-feed',
  name: 'StyleFeed Marketplace (fixture)',
  listings: FEED_LISTINGS_LATER,
});

export const LATER_ADAPTERS = Object.freeze([RETAILER_ADAPTER_LATER, BRAND_ADAPTER, FEED_ADAPTER_LATER]);

// -- pre-built "stored offer records", as if a prior run had already
//    resolved and persisted them, for revalidation tests ---------------------

function buildStoredRecord(intendedItem, listing, adapterId) {
  const offer = verifyOffer({ intendedItem, listingSnapshot: { ...listing, adapterId }, now: FIXTURE_NOW });
  return { ...offer, intendedItem };
}

export const STORED_OFFER_RECORDS = Object.freeze({
  belt: buildStoredRecord(EXACT_MATCH_ITEM, RETAILER_LISTINGS_INITIAL.find((l) => l.listingId === 'rt-belt-001'), 'retailer-fixture'),
  tie: buildStoredRecord(REDIRECT_ITEM, RETAILER_LISTINGS_INITIAL.find((l) => l.listingId === 'rt-tie-001'), 'retailer-fixture'),
  watch: buildStoredRecord(AFFILIATE_LOSS_ITEM, RETAILER_LISTINGS_INITIAL.find((l) => l.listingId === 'rt-watch-001'), 'retailer-fixture'),
  liner: buildStoredRecord(LINER_ITEM, RETAILER_LISTINGS_INITIAL.find((l) => l.listingId === 'rt-liner-001'), 'retailer-fixture'),
});

// -- synthetic resolved-item sets for coverage/threshold tests ---------------
// (shaped exactly like scripts/link-engine.mjs resolveSupportingItem output,
// hand-built here so coverage tests don't need to run the full pipeline)

function eligible(outfitItemId) {
  return {
    outcome: 'verified',
    type: 'exact',
    offer: { linkStatus: 'live', affiliateEligible: true, affiliateUrl: `https://example-retailer.test/aff/${outfitItemId}` },
    intendedItem: { outfitItemId, label: outfitItemId },
  };
}

function ineligible(outfitItemId, offerLinkStatus) {
  if (offerLinkStatus) {
    return {
      outcome: 'verified',
      type: 'exact',
      offer: { linkStatus: offerLinkStatus, affiliateEligible: false, affiliateUrl: null },
      intendedItem: { outfitItemId, label: outfitItemId },
    };
  }
  return {
    outcome: 'needs-human',
    type: null,
    offer: null,
    reason: 'ambiguous-match',
    intendedItem: { outfitItemId, label: outfitItemId },
  };
}

export const GUIDE_COVERAGE_BELOW_TARGET_ITEMS = Object.freeze([
  eligible('gc-a-1'),
  eligible('gc-a-2'),
  eligible('gc-a-3'),
  ineligible('gc-a-4', 'out-of-stock'),
  ineligible('gc-a-5'),
]); // 3/5 = 60% — below the 80% minimum

export const GUIDE_COVERAGE_AT_TARGET_ITEMS = Object.freeze([
  eligible('gc-b-1'),
  eligible('gc-b-2'),
  eligible('gc-b-3'),
  eligible('gc-b-4'),
  ineligible('gc-b-5', 'dead'),
]); // 4/5 = 80% — exactly meets the minimum

export const GUIDE_COVERAGE_ABOVE_TARGET_ITEMS = Object.freeze([
  eligible('gc-c-1'),
  eligible('gc-c-2'),
  eligible('gc-c-3'),
  eligible('gc-c-4'),
  eligible('gc-c-5'),
]); // 5/5 = 100%
