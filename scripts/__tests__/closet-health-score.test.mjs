import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXTURE_WARDROBE } from '../__fixtures__/personalization.mjs';
import {
  CLOSET_HEALTH_WEIGHTS,
  scoreClosetHealth,
  serializeClosetHealth,
} from '../closet-health-score.mjs';

const wardrobe = FIXTURE_WARDROBE.map(({ id, productId }) => ({
  itemId: id,
  productId,
  confirmedExact: true,
}));

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

test('weights are explicit, bounded, and complete', () => {
  assert.equal(Object.values(CLOSET_HEALTH_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1);
  assert.ok(Object.values(CLOSET_HEALTH_WEIGHTS).every((weight) => weight > 0 && weight < 1));
});

test('fixture closet reports its confirmed role gap without inventing an item', () => {
  const result = scoreClosetHealth({ wardrobeItems: wardrobe });
  assert.equal(result.ok, true);
  assert.deepEqual(result.health.evidence.missingRoles, ['footwear']);
  assert.equal(
    result.health.prioritizedActions.some(({ action }) => action === 'review-confirmed-role-gap'),
    true,
  );
  assert.equal(result.health.components.wearUtilization, null);
});

test('missing wear evidence lowers confidence, not closet quality', () => {
  const withoutWear = scoreClosetHealth({ wardrobeItems: wardrobe }).health;
  const partialWear = scoreClosetHealth({
    wardrobeItems: wardrobe,
    wearEvidence: [wear(wardrobe[0].itemId)],
  }).health;
  assert.equal(withoutWear.components.wearUtilization, null);
  assert.equal(withoutWear.components.roleBalance, partialWear.components.roleBalance);
  assert.equal(withoutWear.components.versatility, partialWear.components.versatility);
  assert.equal(withoutWear.components.redundancyHealth, partialWear.components.redundancyHealth);
  assert.ok(withoutWear.evidenceCoverage < partialWear.evidenceCoverage);
  assert.equal(withoutWear.confidence, 'low');
});

test('forgotten, never-worn, and repair evidence produce owned-first actions', () => {
  const result = scoreClosetHealth({
    wardrobeItems: wardrobe,
    wearEvidence: [
      wear(wardrobe[0].itemId, { wearState: 'forgotten', recencyBucket: '181+-days' }),
      wear(wardrobe[1].itemId, { wearState: 'never-worn', wearCountBucket: '0', recencyBucket: 'never' }),
      wear(wardrobe[2].itemId, { condition: 'repair-needed' }),
    ],
  }).health;
  assert.deepEqual(result.evidence.forgottenItemIds, [wardrobe[0].itemId]);
  assert.deepEqual(result.evidence.neverWornItemIds, [wardrobe[1].itemId]);
  assert.deepEqual(result.evidence.repairItemIds, [wardrobe[2].itemId]);
  assert.deepEqual(result.prioritizedActions.slice(0, 3).map(({ action }) => action), [
    'repair-owned-item',
    'rediscover-owned-item',
    'style-never-worn-item',
  ]);
});

test('redundancy names the exact similar owned references', () => {
  const duplicate = {
    itemId: 'owned-cream-tee-two',
    productId: 'cream-tee',
    confirmedExact: true,
  };
  const result = scoreClosetHealth({ wardrobeItems: [...wardrobe, duplicate] }).health;
  assert.deepEqual(result.evidence.duplicateGroups, [[
    'owned-cream-tee',
    'owned-cream-tee-two',
  ]]);
  assert.equal(result.prioritizedActions.some(
    ({ action }) => action === 'rotate-similar-owned-items',
  ), true);
});

test('unresolved products remain evidence gaps and lower confidence', () => {
  const unresolved = { itemId: 'owned-unknown', productId: 'unknown', confirmedExact: true };
  const result = scoreClosetHealth({ wardrobeItems: [...wardrobe, unresolved] }).health;
  assert.deepEqual(result.evidence.unresolvedItemIds, ['owned-unknown']);
  assert.equal(result.prioritizedActions.some(
    ({ action }) => action === 'correct-unresolved-owned-items',
  ), true);
  assert.ok(result.evidenceCoverage < 50);
});

test('invalid or private wear evidence fails closed', () => {
  assert.equal(scoreClosetHealth({ wardrobeItems: [] }).error, 'confirmed-wardrobe-required');
  assert.equal(scoreClosetHealth({
    wardrobeItems: wardrobe,
    wearEvidence: [{ ...wear(wardrobe[0].itemId), exactWearDate: '2026-07-01' }],
  }).error, 'valid-minimized-wear-evidence-required');
  assert.equal(scoreClosetHealth({
    wardrobeItems: wardrobe,
    wearEvidence: [wear('not-owned')],
  }).error, 'valid-minimized-wear-evidence-required');
});

test('impossible wear-state and bucket combinations fail closed', () => {
  const itemId = wardrobe[0].itemId;
  const cases = [
    wear(itemId, { wearState: 'never-worn', wearCountBucket: '1-4', recencyBucket: 'never' }),
    wear(itemId, { wearState: 'never-worn', wearCountBucket: '0', recencyBucket: '0-30-days' }),
    wear(itemId, { wearState: 'forgotten', wearCountBucket: '5-14', recencyBucket: '31-180-days' }),
    wear(itemId, { wearState: 'active', wearCountBucket: '0', recencyBucket: 'never' }),
    wear(itemId, { wearCountBucket: 'many' }),
    wear(itemId, { recencyBucket: 'recently' }),
  ];
  for (const evidence of cases) {
    assert.equal(
      scoreClosetHealth({ wardrobeItems: wardrobe, wearEvidence: [evidence] }).error,
      'valid-minimized-wear-evidence-required',
    );
  }
});

test('output contains no purchase, affiliate, price, notes, or exact dates', () => {
  const health = scoreClosetHealth({
    wardrobeItems: wardrobe,
    wearEvidence: wardrobe.map(({ itemId }) => wear(itemId)),
  }).health;
  assert.doesNotMatch(
    JSON.stringify(health),
    /affiliate|commission|purchase|paid|price|fitNote|wornAt|acquiredAt|occasion/i,
  );
  assert.ok(health.prioritizedActions.every(({ action }) => !action.includes('buy')));
});

test('identical evidence serializes byte-stably', () => {
  const health = scoreClosetHealth({
    wardrobeItems: wardrobe,
    wearEvidence: wardrobe.map(({ itemId }) => wear(itemId)),
  }).health;
  assert.equal(serializeClosetHealth(health), serializeClosetHealth(structuredClone(health)));
});
