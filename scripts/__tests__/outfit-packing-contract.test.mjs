import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMinimizedOutfitPlan,
  correctOutfitPlanningRequest,
  createOutfitPlanningRequest,
  invalidateOutfitPlanningRequest,
  planFixtureOutfits,
} from '../outfit-packing-contract.mjs';

const NOW = '2026-07-26T01:00:00.000Z';

function request(overrides = {}) {
  return createOutfitPlanningRequest({
    planId: 'fixture-trip-1',
    profileRef: { profileId: 'profile-1', version: 2 },
    wardrobeSnapshotRef: { wardrobeId: 'wardrobe-1', version: 7 },
    preferredColors: ['navy'],
    maxUsesPerItem: 2,
    maxPackedItems: 8,
    essentialItemIds: ['watch-1'],
    days: [
      {
        date: '2026-08-01',
        occasionCategory: 'city-day',
        occasionNote: 'Private note',
        dressCode: 'casual',
        climateTags: ['warm'],
        requiredCategories: ['top', 'bottom', 'footwear'],
      },
      {
        date: '2026-08-02',
        occasionCategory: 'dinner',
        dressCode: 'smart-casual',
        climateTags: ['warm'],
        requiredCategories: ['top', 'bottom', 'footwear'],
      },
    ],
    ...overrides,
  }, { nowIso: NOW });
}

function wardrobe() {
  return [
    { itemId: 'tee-1', productId: 'product-tee-1', confirmedExact: true, category: 'top', colors: ['navy'], climateTags: ['warm'], dressCodes: ['casual'], state: 'available' },
    { itemId: 'polo-1', productId: 'product-polo-1', confirmedExact: true, category: 'top', colors: ['cream'], climateTags: ['warm'], dressCodes: ['smart-casual'], state: 'available' },
    { itemId: 'trouser-1', productId: 'product-trouser-1', confirmedExact: true, category: 'bottom', colors: ['navy'], climateTags: ['warm'], dressCodes: ['casual', 'smart-casual'], state: 'available' },
    { itemId: 'shoe-1', productId: 'product-shoe-1', confirmedExact: true, category: 'footwear', colors: ['white'], climateTags: ['warm'], dressCodes: ['casual', 'smart-casual'], state: 'available' },
    { itemId: 'watch-1', productId: 'product-watch-1', confirmedExact: true, category: 'accessory', colors: ['silver'], climateTags: ['warm'], dressCodes: ['casual', 'smart-casual'], state: 'available' },
  ];
}

test('creates a versioned private request from explicit inputs', () => {
  const result = request();
  assert.equal(result.ok, true);
  assert.equal(result.request.version, 1);
  assert.equal(result.request.privateInputs.days.provenance, 'explicit-user-input');
  assert.equal(result.request.fixtureOnly, true);
});

test('rejects invalid days, duplicate dates, and repeat limits', () => {
  assert.equal(request({ days: [] }).error, 'at-least-one-plan-day-required');
  assert.equal(request({ maxUsesPerItem: 0 }).error, 'invalid-repeat-limit');
  const duplicate = request().request.privateInputs.days.value;
  assert.equal(request({ days: [duplicate[0], duplicate[0]] }).error, 'duplicate-plan-date');
});

test('plans complete outfits from confirmed available owned items only', () => {
  const created = request();
  const result = planFixtureOutfits(created.request, wardrobe());
  assert.equal(result.ok, true);
  assert.equal(result.plan.status, 'complete');
  assert.equal(result.plan.confidence, 1);
  assert.equal(result.plan.outfits.length, 2);
  assert.equal(result.plan.evidence.confirmedOwnedItemsOnly, true);
});

test('deduplicates packing items and labels an explicit essential', () => {
  const result = planFixtureOutfits(request().request, wardrobe());
  assert.deepEqual(result.plan.packingList.map((item) => item.itemId), [
    'tee-1', 'trouser-1', 'shoe-1', 'polo-1', 'watch-1',
  ]);
  assert.equal(result.plan.packingList.at(-1).reason, 'explicit-user-essential');
});

test('dirty, unavailable, and unconfirmed items never enter a plan', () => {
  const items = wardrobe().map((item) => (
    item.category === 'footwear' ? { ...item, state: 'dirty' } : item
  ));
  items.push({ itemId: 'shoe-2', productId: 'product-shoe-2', confirmedExact: false, category: 'footwear', colors: ['black'], climateTags: ['warm'], dressCodes: ['casual', 'smart-casual'], state: 'available' });
  const result = planFixtureOutfits(request().request, items);
  assert.equal(result.plan.status, 'partial');
  assert.equal(result.plan.outfits.every((outfit) => outfit.itemRefs.every((item) => !item.itemId.startsWith('shoe-'))), true);
  assert.equal(result.plan.gaps.filter((gap) => gap.category === 'footwear').length, 2);
});

test('repeat constraints return honest gaps rather than fabricated outfits', () => {
  const created = request({ maxUsesPerItem: 1 });
  const result = planFixtureOutfits(created.request, wardrobe());
  assert.equal(result.plan.status, 'partial');
  assert.deepEqual(result.plan.gaps.map((gap) => gap.category), ['bottom', 'footwear']);
  assert.ok(result.plan.outfits[1].opposingEvidence.length > 0);
});

test('packing limits fail with exact evidence', () => {
  const created = request({ maxPackedItems: 4 });
  const result = planFixtureOutfits(created.request, wardrobe());
  assert.equal(result.ok, false);
  assert.equal(result.error, 'packing-limit-exceeded');
  assert.deepEqual(result.evidence, { requiredCount: 5, maxPackedItems: 4 });
});

test('explicit corrections create a new immutable request version', () => {
  const original = request().request;
  const corrected = correctOutfitPlanningRequest(original, { maxUsesPerItem: 3 }, {
    nowIso: '2026-07-26T02:00:00.000Z',
  });
  assert.equal(corrected.ok, true);
  assert.equal(corrected.request.version, 2);
  assert.equal(corrected.request.privateInputs.maxUsesPerItem.value, 3);
  assert.equal(corrected.request.privateInputs.maxUsesPerItem.provenance, 'explicit-user-correction');
  assert.equal(original.privateInputs.maxUsesPerItem.value, 2);
});

test('minimized output excludes dates, notes, profile, prices, fit, and ledgers', () => {
  const created = request();
  const planned = planFixtureOutfits(created.request, wardrobe());
  const minimized = buildMinimizedOutfitPlan(planned.plan);
  const serialized = JSON.stringify(minimized.plan);
  assert.equal(minimized.ok, true);
  for (const forbidden of ['2026-08-01', 'Private note', 'profile-1', 'price', 'fitNote', 'corrections']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.deepEqual(Object.keys(minimized.plan).sort(), [
    'confidence',
    'gaps',
    'outfits',
    'packingList',
    'planId',
    'planVersion',
    'status',
    'wardrobeSnapshotRef',
  ]);
});

test('invalidation removes private inputs and blocks future planning', () => {
  const original = request().request;
  const invalidated = invalidateOutfitPlanningRequest(original, {
    nowIso: '2026-07-26T03:00:00.000Z',
  });
  assert.equal(invalidated.ok, true);
  assert.equal(invalidated.request.privateInputs, null);
  assert.equal(invalidated.request.status, 'invalidated');
  assert.equal(planFixtureOutfits(invalidated.request, wardrobe()).error, 'active-planning-request-required');
  assert.notEqual(original.privateInputs, null);
});
