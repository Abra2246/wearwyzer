import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
} from '../__fixtures__/personalization.mjs';
import {
  compareProspectivePurchases,
  serializePurchaseComparison,
} from '../purchase-simulator.mjs';

const NOW = '2026-07-26T00:00:00.000Z';

test('selects the strongest qualified wardrobe investment', () => {
  const result = compareProspectivePurchases({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['adidas-samba-og-b75806', 'birkenstock-boston-taupe'],
    nowIso: NOW,
  });
  assert.equal(result.comparison.decision.status, 'selected');
  assert.deepEqual(result.comparison.decision.selectedCandidateIds, ['adidas-samba-og-b75806']);
  assert.equal(result.comparison.candidates[0].scores.purchaseRoi, 85);
});

test('candidate order cannot alter the selected result', () => {
  const first = compareProspectivePurchases({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['adidas-samba-og-b75806', 'birkenstock-boston-taupe'],
    nowIso: NOW,
  });
  const second = compareProspectivePurchases({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['birkenstock-boston-taupe', 'adidas-samba-og-b75806'],
    nowIso: NOW,
  });
  assert.deepEqual(first.comparison.decision, second.comparison.decision);
});

test('buy-none is honest when no candidate clears product and quality gates', () => {
  const result = compareProspectivePurchases({
    profile: { ...FIXTURE_PROFILE, avoidedBrands: ['adidas', 'Dickies'] },
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['adidas-samba-og-b75806', 'dickies-874-dark-navy'],
    nowIso: NOW,
  });
  assert.equal(result.comparison.decision.status, 'buy-none');
  assert.deepEqual(result.comparison.decision.selectedCandidateIds, []);
});

test('stale and unavailable products cannot silently win', () => {
  const catalog = [
    { id: 'one', name: 'One', categoryId: 'shoes', colorway: 'White', tags: ['Everyday'], brandId: 'adidas' },
    { id: 'two', name: 'Two', categoryId: 'shoes', colorway: 'White', tags: ['Everyday'], brandId: 'adidas' },
    ...FIXTURE_WARDROBE.map(({ productId }, index) => ({
      id: productId,
      name: productId,
      categoryId: index < 2 ? 'shirts' : index < 4 ? 'pants' : 'outerwear',
      colorway: 'Navy',
      tags: ['Everyday'],
    })),
  ];
  const offers = [
    { productId: 'one', priceStatus: 'confirmed', price: 100 },
    { productId: 'two', priceStatus: 'confirmed', price: 100 },
  ];
  const facts = [
    { id: 'one', brand: 'adidas', sourceUrl: 'https://example.test/one', sourceVerifiedAt: '2026-01-01T00:00:00.000Z', availabilityStatus: 'available' },
    { id: 'two', brand: 'adidas', sourceUrl: 'https://example.test/two', sourceVerifiedAt: NOW, availabilityStatus: 'sold-out' },
  ];
  const result = compareProspectivePurchases({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['one', 'two'],
    nowIso: NOW,
    catalog,
    offers,
    facts,
  });
  assert.equal(result.comparison.decision.status, 'buy-none');
  assert.deepEqual(result.comparison.candidates.map(({ status }) => status), [
    'source-stale',
    'availability-sold-out',
  ]);
});

test('unknown candidates stay explicit and cannot win', () => {
  const result = compareProspectivePurchases({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['unknown-product', 'dickies-874-dark-navy'],
    nowIso: NOW,
  });
  assert.equal(result.comparison.candidates[0].candidateId, 'unknown-product');
  assert.equal(result.comparison.candidates[0].status, 'unknown-product');
  assert.equal(result.comparison.decision.status, 'buy-none');
});

test('duplicate, short, long, and invalid-time comparisons fail closed', () => {
  for (const candidateIds of [
    ['adidas-samba-og-b75806'],
    ['adidas-samba-og-b75806', 'adidas-samba-og-b75806'],
    ['one', 'two', 'three', 'four'],
  ]) {
    assert.equal(
      compareProspectivePurchases({
        profile: FIXTURE_PROFILE,
        wardrobe: FIXTURE_WARDROBE,
        candidateIds,
        nowIso: NOW,
      }).error,
      'two-or-three-unique-candidates-required',
    );
  }
  assert.equal(
    compareProspectivePurchases({
      profile: FIXTURE_PROFILE,
      wardrobe: FIXTURE_WARDROBE,
      candidateIds: ['adidas-samba-og-b75806', 'birkenstock-boston-taupe'],
      nowIso: 'not-a-date',
    }).error,
    'valid-now-required',
  );
});

test('comparison output excludes affiliate and private profile data', () => {
  const result = compareProspectivePurchases({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['adidas-samba-og-b75806', 'birkenstock-boston-taupe'],
    nowIso: NOW,
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /affiliate|commission|fixture-user|preferredColors|fitPreferences/);
});

test('comparison serialization is byte-stable', () => {
  const comparison = compareProspectivePurchases({
    profile: FIXTURE_PROFILE,
    wardrobe: FIXTURE_WARDROBE,
    candidateIds: ['adidas-samba-og-b75806', 'birkenstock-boston-taupe'],
    nowIso: NOW,
  }).comparison;
  assert.equal(
    serializePurchaseComparison(comparison),
    serializePurchaseComparison(structuredClone(comparison)),
  );
});
