import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSupportingItem, runLinkEngineForOutfit, detectDuplicateOffers, classifyRevalidationAction, revalidateOfferRecords } from '../link-engine.mjs';
import { isStale } from '../link-engine-verifier.mjs';
import {
  EXACT_MATCH_ITEM,
  AMBIGUOUS_ITEM,
  NO_MATCH_ITEM,
  DEAD_LINK_ITEM,
  OUT_OF_STOCK_ITEM,
  DIRECT_BRAND_ITEM,
  DUP_ITEM_A,
  DUP_ITEM_B,
  INITIAL_ADAPTERS,
  LATER_ADAPTERS,
  STORED_OFFER_RECORDS,
  FIXTURE_NOW,
  FIXTURE_LATER,
} from '../__fixtures__/link-engine.mjs';

// -- exact match --------------------------------------------------------------

test('exact match: a canonical-id match resolves to a verified exact offer with all three URL fields distinguished', async () => {
  const result = await resolveSupportingItem(EXACT_MATCH_ITEM, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.type, 'exact');
  assert.equal(result.offer.linkStatus, 'live');
  assert.equal(result.offer.retailerUrl, 'https://example-retailer.test/p/classic-leather-belt');
  assert.equal(result.offer.affiliateUrl, 'https://example-retailer.test/aff/classic-leather-belt?ref=wearwyzer');
  assert.equal(result.offer.affiliateEligible, true);
});

test('exact match: a brand-direct listing with no affiliate program still verifies live but is not coverage-eligible', async () => {
  const result = await resolveSupportingItem(DIRECT_BRAND_ITEM, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.offer.linkStatus, 'live');
  assert.equal(result.offer.canonicalUrl, 'https://harborandbell.test/products/waxed-field-jacket');
  assert.equal(result.offer.affiliateUrl, null);
  assert.equal(result.offer.affiliateEligible, false);
});

// -- ambiguity ------------------------------------------------------------------

test('ambiguity: two close competing candidates become needs-human with ranked evidence, never an auto-pick', async () => {
  const result = await resolveSupportingItem(AMBIGUOUS_ITEM, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.reason, 'ambiguous-match');
  assert.equal(result.offer, null);
  assert.equal(result.evidence.length, 2);
});

test('no candidate at all also becomes needs-human, distinct from ambiguous', async () => {
  const result = await resolveSupportingItem(NO_MATCH_ITEM, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.reason, 'no-candidate-found');
});

// -- out of stock (no alternative available) -------------------------------------

test('out of stock with no approved alternative in the category becomes needs-human, never silently dropped', async () => {
  const result = await resolveSupportingItem(OUT_OF_STOCK_ITEM, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.reason, 'exact-item-unavailable-no-alternative');
  assert.equal(result.offer.linkStatus, 'out-of-stock');
});

// -- dead link + alternative substitution -----------------------------------------

test('dead link: exact item is 404, an approved same-category/gender/price-tier alternative is substituted and clearly labeled', async () => {
  const result = await resolveSupportingItem(DEAD_LINK_ITEM, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  assert.equal(result.outcome, 'verified');
  assert.equal(result.type, 'alternative');
  assert.equal(result.originalItemStatus, 'dead');
  assert.equal(result.offer.linkStatus, 'live');
  assert.notEqual(result.offer.listingId, 'rt-cap-broken');
});

test('dead link: allowAlternative=false stops at needs-human instead of ever substituting', async () => {
  const result = await resolveSupportingItem(DEAD_LINK_ITEM, INITIAL_ADAPTERS, { now: FIXTURE_NOW, allowAlternative: false });
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.reason, 'exact-item-unavailable');
});

// -- duplicate offer detection -----------------------------------------------------

test('duplicate offer: two distinct outfit items resolving to the same listing are flagged, not silently allowed', async () => {
  const outfit = { outfitId: 'fx-outfit-3', items: [DUP_ITEM_A, DUP_ITEM_B] };
  const result = await runLinkEngineForOutfit(outfit, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  assert.equal(result.results.every((r) => r.outcome === 'verified'), true);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].listingId, 'rt-sunglasses-050');
  assert.deepEqual(result.duplicates[0].outfitItemIds.sort(), ['fx-outfit-3--0', 'fx-outfit-3--1']);
});

test('detectDuplicateOffers ignores needs-human results (nothing to flag as duplicate)', () => {
  const dup = detectDuplicateOffers([
    { outcome: 'needs-human', intendedItem: { outfitItemId: 'a' } },
    { outcome: 'needs-human', intendedItem: { outfitItemId: 'b' } },
  ]);
  assert.equal(dup.length, 0);
});

// -- classifyRevalidationAction ----------------------------------------------------

test('classifyRevalidationAction: dead/unavailable -> removed, redirected/mismatched/out-of-stock -> flagged, ineligible-but-live -> flagged, live+eligible -> unchanged', () => {
  assert.equal(classifyRevalidationAction({ linkStatus: 'dead' }), 'removed');
  assert.equal(classifyRevalidationAction(null), 'removed');
  assert.equal(classifyRevalidationAction({ linkStatus: 'redirected' }), 'flagged');
  assert.equal(classifyRevalidationAction({ linkStatus: 'mismatched' }), 'flagged');
  assert.equal(classifyRevalidationAction({ linkStatus: 'out-of-stock' }), 'flagged');
  assert.equal(classifyRevalidationAction({ linkStatus: 'live', affiliateEligible: false, affiliateUrl: null }), 'flagged');
  assert.equal(classifyRevalidationAction({ linkStatus: 'live', affiliateEligible: true, affiliateUrl: 'x' }), 'unchanged');
});

// -- scheduled revalidation: dead link removed --------------------------------------

test('revalidation: a link that has gone fully dead since it was stored is removed', async () => {
  const [result] = await revalidateOfferRecords([STORED_OFFER_RECORDS.belt], LATER_ADAPTERS, {
    now: FIXTURE_LATER,
    isStaleCheck: (record, ctx) => isStale(record, ctx),
  });
  assert.equal(result.action, 'removed');
  assert.equal(result.linkStatus, 'dead');
  assert.equal(result.previousLinkStatus, 'live');
});

// -- scheduled revalidation: redirect flagged ---------------------------------------

test('revalidation: an unexpected redirect is flagged for human confirmation, not silently followed', async () => {
  const [result] = await revalidateOfferRecords([STORED_OFFER_RECORDS.tie], LATER_ADAPTERS, {
    now: FIXTURE_LATER,
    isStaleCheck: (record, ctx) => isStale(record, ctx),
  });
  assert.equal(result.action, 'flagged');
  assert.equal(result.linkStatus, 'redirected');
});

// -- scheduled revalidation: affiliate eligibility loss ------------------------------

test('revalidation: a link that stays live but loses affiliate eligibility is flagged, not silently kept as counting toward coverage', async () => {
  const [result] = await revalidateOfferRecords([STORED_OFFER_RECORDS.watch], LATER_ADAPTERS, {
    now: FIXTURE_LATER,
    isStaleCheck: (record, ctx) => isStale(record, ctx),
  });
  assert.equal(result.action, 'flagged');
  assert.equal(result.linkStatus, 'live');
  assert.equal(result.affiliateEligible, false);
});

// -- scheduled revalidation: out-of-stock replaced with a fresh alternative ----------

test('revalidation: an item that has gone out of stock since storage is replaced once a fresh alternative appears', async () => {
  const [result] = await revalidateOfferRecords([STORED_OFFER_RECORDS.liner], LATER_ADAPTERS, {
    now: FIXTURE_LATER,
    isStaleCheck: (record, ctx) => isStale(record, ctx),
  });
  assert.equal(result.action, 'replaced');
  assert.equal(result.linkStatus, 'live');
  assert.notEqual(result.listingId, 'rt-liner-001');
});

// -- scheduled revalidation: staleness gating ----------------------------------------

test('revalidation: a fresh (not-yet-stale) record is skipped and left unchanged', async () => {
  const [result] = await revalidateOfferRecords([STORED_OFFER_RECORDS.belt], LATER_ADAPTERS, {
    now: FIXTURE_NOW, // same moment it was verified — not stale yet
    isStaleCheck: (record, ctx) => isStale(record, ctx),
  });
  assert.equal(result.action, 'unchanged');
  assert.equal(result.linkStatus, 'live'); // stored value preserved, not re-verified against the "later" (dead) state
});

test('revalidation: force=true re-checks even a fresh record', async () => {
  const [result] = await revalidateOfferRecords([STORED_OFFER_RECORDS.belt], LATER_ADAPTERS, { now: FIXTURE_NOW, force: true });
  assert.equal(result.action, 'removed');
});

test('revalidation: an offer whose adapter is no longer configured is flagged, never silently dropped', async () => {
  const orphanRecord = { ...STORED_OFFER_RECORDS.belt, adapterId: 'retired-adapter' };
  const [result] = await revalidateOfferRecords([orphanRecord], LATER_ADAPTERS, { now: FIXTURE_LATER, force: true });
  assert.equal(result.action, 'flagged');
  assert.match(result.flagReason, /no longer configured/);
});
