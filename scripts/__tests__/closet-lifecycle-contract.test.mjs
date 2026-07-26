import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMinimizedWearEvidence,
  CLOSET_LIFECYCLE_VERSION,
  correctClosetLifecycle,
  createClosetLifecycleRecord,
  FORGOTTEN_ITEM_DAYS,
  recordClosetWear,
  summarizeClosetLifecycle,
} from '../closet-lifecycle-contract.mjs';

const NOW = '2026-07-26T01:30:00.000Z';

function createRecord(overrides = {}) {
  const result = createClosetLifecycleRecord({
    itemId: 'owned-dickies-874-dark-navy',
    productId: 'dickies-874-dark-navy',
    condition: 'good',
    acquiredAtIso: '2026-01-10T12:00:00.000Z',
    paidAmountUsd: 30,
    fitNote: 'True at the waist; straight through the leg.',
    ...overrides,
  }, { nowIso: NOW });
  assert.equal(result.ok, true);
  return result.record;
}

test('creates a versioned private lifecycle record from explicit fixture input', () => {
  const record = createRecord();
  assert.equal(record.schemaVersion, CLOSET_LIFECYCLE_VERSION);
  assert.equal(record.fixtureOnly, true);
  assert.equal(record.version, 1);
  assert.equal(record.privateFields.condition.provenance, 'explicit-user-input');
  assert.equal(record.privateFields.fitNote.confidence, 1);
  assert.deepEqual(record.wearEvents, []);
});

test('rejects invalid condition, price, and future acquisition evidence', () => {
  assert.equal(createClosetLifecycleRecord({
    itemId: 'owned-x',
    productId: 'x',
    condition: 'destroyed',
  }, { nowIso: NOW }).error, 'unsupported-item-condition');
  assert.equal(createClosetLifecycleRecord({
    itemId: 'owned-x',
    productId: 'x',
    paidAmountUsd: -1,
  }, { nowIso: NOW }).error, 'invalid-paid-amount');
  assert.equal(createClosetLifecycleRecord({
    itemId: 'owned-x',
    productId: 'x',
    acquiredAtIso: '2027-01-01T00:00:00.000Z',
  }, { nowIso: NOW }).error, 'future-acquisition-date');
});

test('explicit corrections are versioned and visibly outrank earlier fields', () => {
  const record = createRecord();
  const result = correctClosetLifecycle(record, {
    condition: 'excellent',
    fitNote: 'Waist is exact; hem needs no break.',
  }, { nowIso: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.record.version, 2);
  assert.match(result.correction.correctionId, /correction-v2$/);
  assert.equal(result.record.privateFields.condition.value, 'excellent');
  assert.equal(result.record.privateFields.condition.provenance, 'explicit-user-correction');
  assert.equal(result.record.privateFields.fitNote.confidence, 1);
  assert.equal(record.privateFields.condition.value, 'good');
});

test('wear events reject future, pre-acquisition, and duplicate timestamps', () => {
  const record = createRecord();
  assert.equal(recordClosetWear(record, {
    wornAtIso: '2027-01-01T00:00:00.000Z',
  }, { nowIso: NOW }).error, 'future-wear-event');
  assert.equal(recordClosetWear(record, {
    wornAtIso: '2025-12-01T00:00:00.000Z',
  }, { nowIso: NOW }).error, 'wear-before-acquisition');
  const first = recordClosetWear(record, {
    wornAtIso: '2026-07-20T12:00:00.000Z',
    occasion: 'creative office',
  }, { nowIso: NOW });
  assert.equal(first.ok, true);
  assert.equal(recordClosetWear(first.record, {
    wornAtIso: '2026-07-20T12:00:00.000Z',
  }, { nowIso: NOW }).error, 'duplicate-wear-event');
});

test('summary distinguishes never-worn, active, and forgotten items', () => {
  const never = summarizeClosetLifecycle(createRecord(), { nowIso: NOW }).summary;
  assert.equal(never.wearState, 'never-worn');
  assert.equal(never.costPerWearUsd, null);

  const activeRecord = recordClosetWear(createRecord(), {
    wornAtIso: '2026-07-20T12:00:00.000Z',
  }, { nowIso: NOW }).record;
  const active = summarizeClosetLifecycle(activeRecord, { nowIso: NOW }).summary;
  assert.equal(active.wearState, 'active');
  assert.equal(active.costPerWearUsd, 30);

  const oldRecord = recordClosetWear(createRecord({
    acquiredAtIso: '2024-01-01T00:00:00.000Z',
  }), {
    wornAtIso: '2025-01-01T00:00:00.000Z',
  }, { nowIso: NOW }).record;
  const forgotten = summarizeClosetLifecycle(oldRecord, { nowIso: NOW }).summary;
  assert.equal(forgotten.wearState, 'forgotten');
  assert.ok(forgotten.daysSinceLastWorn > FORGOTTEN_ITEM_DAYS);
});

test('cost per wear is deterministic and uses only explicit price and wear events', () => {
  let record = createRecord({ paidAmountUsd: 99 });
  for (const wornAtIso of [
    '2026-07-20T12:00:00.000Z',
    '2026-07-21T12:00:00.000Z',
    '2026-07-22T12:00:00.000Z',
  ]) {
    record = recordClosetWear(record, { wornAtIso }, { nowIso: NOW }).record;
  }
  const summary = summarizeClosetLifecycle(record, { nowIso: NOW }).summary;
  assert.equal(summary.wearCount, 3);
  assert.equal(summary.costPerWearUsd, 33);
  assert.equal(summary.evidence.paidAmountAvailable, true);
});

test('missing price never produces an invented cost per wear', () => {
  const record = recordClosetWear(createRecord({ paidAmountUsd: null }), {
    wornAtIso: '2026-07-20T12:00:00.000Z',
  }, { nowIso: NOW }).record;
  assert.equal(summarizeClosetLifecycle(record, { nowIso: NOW }).summary.costPerWearUsd, null);
});

test('minimized evidence excludes price, fit notes, exact wear dates, and event history', () => {
  const record = recordClosetWear(createRecord(), {
    wornAtIso: '2026-07-20T12:00:00.000Z',
    occasion: 'date night',
  }, { nowIso: NOW }).record;
  const result = buildMinimizedWearEvidence(record, { nowIso: NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.evidence).sort(), [
    'condition',
    'itemId',
    'lifecycleVersion',
    'recencyBucket',
    'wearCountBucket',
    'wearState',
  ]);
  const serialized = JSON.stringify(result.evidence);
  assert.doesNotMatch(serialized, /paid|fit|occasion|wornAt|wearEvents/i);
  assert.equal(result.evidence.wearCountBucket, '1-4');
  assert.equal(result.evidence.recencyBucket, '0-30-days');
});

test('pure transitions never mutate the prior lifecycle record', () => {
  const record = createRecord();
  const worn = recordClosetWear(record, {
    wornAtIso: '2026-07-20T12:00:00.000Z',
  }, { nowIso: NOW });
  assert.equal(record.version, 1);
  assert.equal(record.wearEvents.length, 0);
  assert.equal(worn.record.version, 2);
  assert.equal(worn.record.wearEvents.length, 1);
});
