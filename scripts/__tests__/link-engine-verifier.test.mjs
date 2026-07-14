import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOffer, isCoverageEligibleOffer, isStale, DEFAULT_MAX_STALE_DAYS } from '../link-engine-verifier.mjs';
import { EXACT_MATCH_ITEM, DEAD_LINK_ITEM, OUT_OF_STOCK_ITEM, FIXTURE_NOW, FIXTURE_LATER } from '../__fixtures__/link-engine.mjs';

const LIVE_LISTING = {
  listingId: 'l1',
  adapterId: 'fx',
  brand: EXACT_MATCH_ITEM.brand,
  name: EXACT_MATCH_ITEM.name,
  title: EXACT_MATCH_ITEM.name,
  category: EXACT_MATCH_ITEM.category,
  canonicalId: EXACT_MATCH_ITEM.canonicalId,
  canonicalUrl: null,
  retailerUrl: 'https://example.test/p/x',
  affiliateUrl: 'https://example.test/aff/x',
  httpStatus: 200,
  redirectTo: null,
  stock: 'in_stock',
  affiliateEligible: true,
  price: 10,
  currency: 'USD',
};

test('verifyOffer marks a delisted (null) snapshot as unavailable, never fabricating a URL', () => {
  const offer = verifyOffer({ intendedItem: EXACT_MATCH_ITEM, listingSnapshot: null, now: FIXTURE_NOW });
  assert.equal(offer.linkStatus, 'unavailable');
  assert.equal(offer.canonicalUrl, null);
  assert.equal(offer.retailerUrl, null);
  assert.equal(offer.affiliateUrl, null);
  assert.equal(offer.verifiedAtIso, FIXTURE_NOW);
});

test('verifyOffer marks a 404 as dead', () => {
  const offer = verifyOffer({ intendedItem: DEAD_LINK_ITEM, listingSnapshot: { ...LIVE_LISTING, httpStatus: 404 }, now: FIXTURE_NOW });
  assert.equal(offer.linkStatus, 'dead');
  assert.match(offer.reasons[0], /HTTP 404/);
});

test('verifyOffer marks a 301 as redirected and keeps the redirect target visible', () => {
  const offer = verifyOffer({
    intendedItem: EXACT_MATCH_ITEM,
    listingSnapshot: { ...LIVE_LISTING, httpStatus: 301, redirectTo: 'https://example.test/p/moved' },
    now: FIXTURE_NOW,
  });
  assert.equal(offer.linkStatus, 'redirected');
  assert.equal(offer.redirectTo, 'https://example.test/p/moved');
});

test('verifyOffer marks a drifted title/brand as mismatched', () => {
  const offer = verifyOffer({
    intendedItem: EXACT_MATCH_ITEM,
    listingSnapshot: { ...LIVE_LISTING, canonicalId: null, brand: 'Totally Different Co', name: 'Unrelated Product' },
    now: FIXTURE_NOW,
  });
  assert.equal(offer.linkStatus, 'mismatched');
});

test('verifyOffer with allowLooseIdentity does not flag a deliberately different alternative as mismatched', () => {
  const offer = verifyOffer({
    intendedItem: EXACT_MATCH_ITEM,
    listingSnapshot: { ...LIVE_LISTING, canonicalId: null, brand: 'A Different Approved Brand', name: 'A Different Item' },
    now: FIXTURE_NOW,
    allowLooseIdentity: true,
  });
  assert.equal(offer.linkStatus, 'live');
});

test('verifyOffer marks out_of_stock as out-of-stock', () => {
  const offer = verifyOffer({ intendedItem: EXACT_MATCH_ITEM, listingSnapshot: { ...LIVE_LISTING, stock: 'out_of_stock' }, now: FIXTURE_NOW });
  assert.equal(offer.linkStatus, 'out-of-stock');
});

test('verifyOffer marks a live listing with no affiliate program as live-but-not-eligible, distinguishing the three URL fields', () => {
  const offer = verifyOffer({
    intendedItem: EXACT_MATCH_ITEM,
    listingSnapshot: { ...LIVE_LISTING, canonicalUrl: 'https://brand.test/p/x', affiliateUrl: null, affiliateEligible: false },
    now: FIXTURE_NOW,
  });
  assert.equal(offer.linkStatus, 'live');
  assert.equal(offer.affiliateEligible, false);
  assert.equal(offer.canonicalUrl, 'https://brand.test/p/x');
  assert.equal(offer.retailerUrl, 'https://example.test/p/x');
  assert.equal(offer.affiliateUrl, null);
  assert.equal(isCoverageEligibleOffer(offer), false);
});

test('verifyOffer marks a fully live, affiliate-eligible listing as live and coverage-eligible', () => {
  const offer = verifyOffer({ intendedItem: EXACT_MATCH_ITEM, listingSnapshot: LIVE_LISTING, now: FIXTURE_NOW });
  assert.equal(offer.linkStatus, 'live');
  assert.equal(isCoverageEligibleOffer(offer), true);
});

test('isCoverageEligibleOffer is false for any non-live status even with affiliateEligible true', () => {
  assert.equal(isCoverageEligibleOffer({ linkStatus: 'out-of-stock', affiliateEligible: true, affiliateUrl: 'x' }), false);
  assert.equal(isCoverageEligibleOffer(null), false);
});

test('isStale is false for a record verified within the max-stale window', () => {
  assert.equal(isStale({ verifiedAtIso: FIXTURE_NOW }, { now: FIXTURE_NOW, maxStaleDays: DEFAULT_MAX_STALE_DAYS }), false);
});

test('isStale is true once the max-stale window has elapsed (stale price/availability trigger)', () => {
  assert.equal(isStale({ verifiedAtIso: FIXTURE_NOW }, { now: FIXTURE_LATER, maxStaleDays: DEFAULT_MAX_STALE_DAYS }), true);
});

test('isStale treats a never-verified record as always stale', () => {
  assert.equal(isStale({ verifiedAtIso: null }, { now: FIXTURE_NOW }), true);
  assert.equal(isStale(null, { now: FIXTURE_NOW }), true);
});
