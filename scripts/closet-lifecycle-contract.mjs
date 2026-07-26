export const CLOSET_LIFECYCLE_VERSION = 'closet-lifecycle-v1';
export const FORGOTTEN_ITEM_DAYS = 180;
export const ITEM_CONDITIONS = Object.freeze([
  'new',
  'excellent',
  'good',
  'worn',
  'repair-needed',
]);

function clone(value) {
  return structuredClone(value);
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function explicitField(value, updatedAtIso) {
  return {
    value,
    provenance: 'explicit-user-input',
    confidence: 1,
    updatedAtIso,
  };
}

function normalizePaidAmount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : NaN;
}

export function createClosetLifecycleRecord(input, { nowIso }) {
  if (!input?.itemId || !input?.productId) {
    return { ok: false, error: 'item-and-product-required' };
  }
  if (!validIso(nowIso)) return { ok: false, error: 'valid-current-time-required' };
  const condition = input.condition ?? 'good';
  if (!ITEM_CONDITIONS.includes(condition)) {
    return { ok: false, error: 'unsupported-item-condition' };
  }
  if (input.acquiredAtIso && !validIso(input.acquiredAtIso)) {
    return { ok: false, error: 'invalid-acquisition-date' };
  }
  if (input.acquiredAtIso && new Date(input.acquiredAtIso) > new Date(nowIso)) {
    return { ok: false, error: 'future-acquisition-date' };
  }
  const paidAmountUsd = normalizePaidAmount(input.paidAmountUsd);
  if (Number.isNaN(paidAmountUsd)) return { ok: false, error: 'invalid-paid-amount' };
  return {
    ok: true,
    record: {
      schemaVersion: CLOSET_LIFECYCLE_VERSION,
      lifecycleId: `fixture-lifecycle-${input.itemId}`,
      version: 1,
      fixtureOnly: true,
      itemId: input.itemId,
      productId: input.productId,
      privateFields: {
        condition: explicitField(condition, nowIso),
        acquiredAtIso: explicitField(input.acquiredAtIso ?? null, nowIso),
        paidAmountUsd: explicitField(paidAmountUsd, nowIso),
        fitNote: explicitField(String(input.fitNote ?? '').trim(), nowIso),
      },
      wearEvents: [],
      corrections: [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
  };
}

export function correctClosetLifecycle(record, input, { nowIso }) {
  if (!record || record.schemaVersion !== CLOSET_LIFECYCLE_VERSION) {
    return { ok: false, error: 'unsupported-lifecycle-record' };
  }
  if (!validIso(nowIso)) return { ok: false, error: 'valid-current-time-required' };
  const updates = {};
  if ('condition' in input) {
    if (!ITEM_CONDITIONS.includes(input.condition)) {
      return { ok: false, error: 'unsupported-item-condition' };
    }
    updates.condition = input.condition;
  }
  if ('acquiredAtIso' in input) {
    if (input.acquiredAtIso && !validIso(input.acquiredAtIso)) {
      return { ok: false, error: 'invalid-acquisition-date' };
    }
    if (input.acquiredAtIso && new Date(input.acquiredAtIso) > new Date(nowIso)) {
      return { ok: false, error: 'future-acquisition-date' };
    }
    updates.acquiredAtIso = input.acquiredAtIso || null;
  }
  if ('paidAmountUsd' in input) {
    const amount = normalizePaidAmount(input.paidAmountUsd);
    if (Number.isNaN(amount)) return { ok: false, error: 'invalid-paid-amount' };
    updates.paidAmountUsd = amount;
  }
  if ('fitNote' in input) updates.fitNote = String(input.fitNote ?? '').trim();
  if (!Object.keys(updates).length) return { ok: false, error: 'no-lifecycle-correction' };

  const next = clone(record);
  next.version += 1;
  const correction = {
    correctionId: `${record.lifecycleId}-correction-v${next.version}`,
    version: next.version,
    fields: Object.entries(updates).map(([key, value]) => ({
      key,
      previousValue: clone(record.privateFields[key]?.value ?? null),
      nextValue: clone(value),
      provenance: 'explicit-user-correction',
      confidence: 1,
    })),
    correctedAtIso: nowIso,
  };
  for (const [key, value] of Object.entries(updates)) {
    next.privateFields[key] = {
      value,
      provenance: 'explicit-user-correction',
      confidence: 1,
      updatedAtIso: nowIso,
    };
  }
  next.corrections.push(correction);
  next.updatedAtIso = nowIso;
  return { ok: true, record: next, correction };
}

export function recordClosetWear(record, input, { nowIso }) {
  if (!record || record.schemaVersion !== CLOSET_LIFECYCLE_VERSION) {
    return { ok: false, error: 'unsupported-lifecycle-record' };
  }
  if (!validIso(nowIso) || !validIso(input?.wornAtIso)) {
    return { ok: false, error: 'valid-wear-time-required' };
  }
  if (new Date(input.wornAtIso) > new Date(nowIso)) {
    return { ok: false, error: 'future-wear-event' };
  }
  const acquiredAtIso = record.privateFields.acquiredAtIso.value;
  if (acquiredAtIso && new Date(input.wornAtIso) < new Date(acquiredAtIso)) {
    return { ok: false, error: 'wear-before-acquisition' };
  }
  if (record.wearEvents.some((event) => event.wornAtIso === input.wornAtIso)) {
    return { ok: false, error: 'duplicate-wear-event' };
  }
  const next = clone(record);
  next.version += 1;
  const event = {
    eventId: `${record.lifecycleId}-wear-v${next.version}`,
    version: next.version,
    wornAtIso: input.wornAtIso,
    occasion: String(input.occasion ?? '').trim() || null,
    provenance: 'explicit-user-input',
    confidence: 1,
    recordedAtIso: nowIso,
  };
  next.wearEvents.push(event);
  next.wearEvents.sort((a, b) => a.wornAtIso.localeCompare(b.wornAtIso));
  next.updatedAtIso = nowIso;
  return { ok: true, record: next, event };
}

export function summarizeClosetLifecycle(record, { nowIso }) {
  if (!record || record.schemaVersion !== CLOSET_LIFECYCLE_VERSION || !validIso(nowIso)) {
    return { ok: false, error: 'valid-lifecycle-record-required' };
  }
  const wearCount = record.wearEvents.length;
  const lastWornAtIso = wearCount ? record.wearEvents[wearCount - 1].wornAtIso : null;
  const daysSinceLastWorn = lastWornAtIso
    ? (new Date(nowIso).getTime() - new Date(lastWornAtIso).getTime()) / 86_400_000
    : null;
  const wearState = wearCount === 0
    ? 'never-worn'
    : daysSinceLastWorn > FORGOTTEN_ITEM_DAYS
      ? 'forgotten'
      : 'active';
  const paidAmountUsd = record.privateFields.paidAmountUsd.value;
  const costPerWearUsd = wearCount > 0 && paidAmountUsd !== null
    ? Number((paidAmountUsd / wearCount).toFixed(2))
    : null;
  return {
    ok: true,
    summary: {
      lifecycleId: record.lifecycleId,
      lifecycleVersion: record.version,
      itemId: record.itemId,
      productId: record.productId,
      wearState,
      wearCount,
      lastWornAtIso,
      daysSinceLastWorn,
      costPerWearUsd,
      condition: clone(record.privateFields.condition),
      fitNote: clone(record.privateFields.fitNote),
      evidence: {
        paidAmountAvailable: paidAmountUsd !== null,
        wearEventCount: wearCount,
        forgottenAfterDays: FORGOTTEN_ITEM_DAYS,
      },
    },
  };
}

export function buildMinimizedWearEvidence(record, { nowIso }) {
  const result = summarizeClosetLifecycle(record, { nowIso });
  if (!result.ok) return result;
  const { summary } = result;
  const wearCountBucket = summary.wearCount === 0
    ? '0'
    : summary.wearCount < 5
      ? '1-4'
      : summary.wearCount < 15
        ? '5-14'
        : '15+';
  const recencyBucket = summary.lastWornAtIso === null
    ? 'never'
    : summary.daysSinceLastWorn <= 30
      ? '0-30-days'
      : summary.daysSinceLastWorn <= FORGOTTEN_ITEM_DAYS
        ? '31-180-days'
        : '181+-days';
  return {
    ok: true,
    evidence: {
      itemId: summary.itemId,
      lifecycleVersion: summary.lifecycleVersion,
      wearState: summary.wearState,
      wearCountBucket,
      recencyBucket,
      condition: summary.condition.value,
    },
  };
}
