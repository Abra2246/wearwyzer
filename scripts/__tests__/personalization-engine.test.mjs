import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePurchase, RECOMMENDATIONS, SCORING_VERSION } from '../personalization-engine.mjs';
import {
  FIXTURE_CANDIDATE_ID,
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
} from '../__fixtures__/personalization.mjs';

test('fixture flow evaluates a verified prospective product with decomposed scores', () => {
  const result = evaluatePurchase({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateId: FIXTURE_CANDIDATE_ID,
  });

  assert.equal(result.ok, true);
  assert.equal(result.scoringVersion, SCORING_VERSION);
  assert.equal(result.candidate.productId, FIXTURE_CANDIDATE_ID);
  assert.equal(result.candidate.availabilityStatus, 'available');
  assert.equal(result.candidate.priceStatus, 'confirmed');
  assert.ok(result.scores.compatibility.score >= 0);
  assert.deepEqual(
    Object.keys(result.scores.compatibility.parts).sort(),
    ['brand', 'fit', 'occasion', 'palette', 'wardrobePairing'].sort(),
  );
  assert.ok(RECOMMENDATIONS.includes(result.recommendation));
});

test('outfit unlocks are unique, owned-first, and capped at three', () => {
  const result = evaluatePurchase({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateId: FIXTURE_CANDIDATE_ID,
  });

  assert.ok(result.outfits.length >= 2);
  assert.ok(result.outfits.length <= 3);
  assert.equal(result.scores.outfitUnlocks, result.outfits.length);
  assert.equal(new Set(result.outfits.map((outfit) => outfit.id)).size, result.outfits.length);
  for (const outfit of result.outfits) {
    assert.ok(outfit.itemIds.includes(FIXTURE_CANDIDATE_ID));
    assert.ok(outfit.ownedItemIds.length >= 2);
    assert.deepEqual(outfit.missingItems, []);
  }
});

test('redundancy names similar owned items instead of returning an opaque score', () => {
  const duplicateWardrobe = [
    ...FIXTURE_WARDROBE,
    { id: 'owned-cloud-x4', productId: 'on-cloud-x4', wearCount: 3 },
  ];
  const result = evaluatePurchase({
    profile: FIXTURE_PROFILE,
    wardrobe: duplicateWardrobe,
    candidateId: FIXTURE_CANDIDATE_ID,
  });

  assert.ok(result.scores.redundancy.similarItems.length >= 1);
  assert.equal(result.scores.redundancy.similarItems[0].productId, 'on-cloud-x4');
  assert.ok(result.scores.redundancy.similarItems[0].reasonCodes.includes('same-category'));
});

test('avoided brands can produce an honest skip recommendation with opposing evidence', () => {
  const result = evaluatePurchase({
    profile: { ...FIXTURE_PROFILE, favoriteBrands: [], avoidedBrands: ['adidas'] },
    wardrobe: FIXTURE_WARDROBE,
    candidateId: FIXTURE_CANDIDATE_ID,
  });

  assert.equal(result.recommendation, 'skip');
  assert.equal(result.scores.compatibility.parts.brand, 0);
  assert.ok(result.reasonCodes.length > 0);
});

test('wait is returned when the item cannot unlock a complete outfit yet', () => {
  const result = evaluatePurchase({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateId: 'cos-tote-bag',
  });

  assert.equal(result.recommendation, 'wait');
  assert.equal(result.scores.outfitUnlocks, 0);
  assert.ok(result.missingRoles.includes('footwear'));
});

test('choose-alternative is returned for a known item with weak wardrobe compatibility', () => {
  const incompatibleCatalog = [
    { id: 'candidate', name: 'Neon Formal Shoe', categoryId: 'shoes', colorway: 'Neon red', tags: ['Formal'], brandId: 'other' },
    { id: 'top-1', name: 'Top 1', categoryId: 'shirts', colorway: 'Purple', tags: ['Gym'] },
    { id: 'top-2', name: 'Top 2', categoryId: 'shirts', colorway: 'Orange', tags: ['Beach'] },
    { id: 'bottom-1', name: 'Bottom 1', categoryId: 'pants', colorway: 'Teal', tags: ['Hiking'] },
    { id: 'bottom-2', name: 'Bottom 2', categoryId: 'pants', colorway: 'Pink', tags: ['Club'] },
    { id: 'extra', name: 'Extra', categoryId: 'bags', colorway: 'Yellow', tags: ['Travel'] },
  ];
  const result = evaluatePurchase({
    profile: {
      ...FIXTURE_PROFILE,
      favoriteBrands: [],
      preferredColors: ['navy'],
      commonOccasions: ['Everyday'],
      fitPreferences: {},
    },
    wardrobe: incompatibleCatalog.slice(1).map((item) => ({ productId: item.id })),
    candidateId: 'candidate',
    catalog: incompatibleCatalog,
    offers: [{ productId: 'candidate', priceStatus: 'confirmed', price: 120 }],
    facts: [{ id: 'candidate', brand: 'Other', sourceUrl: 'https://example.test/candidate', availabilityStatus: 'available' }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendation, 'choose-alternative');
  assert.ok(result.scores.compatibility.score < 50);
});

test('unknown products, incomplete profiles, and short wardrobes fail closed', () => {
  const unknown = evaluatePurchase({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateId: 'not-a-real-product',
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, 'unknown-product');
  assert.equal(unknown.confidence, 'low');

  const incomplete = evaluatePurchase({
    profile: {},
    wardrobe: FIXTURE_WARDROBE,
    candidateId: FIXTURE_CANDIDATE_ID,
  });
  assert.equal(incomplete.error, 'incomplete-profile');

  const short = evaluatePurchase({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE.slice(0, 4),
    candidateId: FIXTURE_CANDIDATE_ID,
  });
  assert.equal(short.error, 'insufficient-wardrobe');
});
