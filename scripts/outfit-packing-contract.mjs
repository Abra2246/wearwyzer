export const OUTFIT_PACKING_VERSION = 'outfit-packing-v1';
export const ITEM_STATES = Object.freeze(['available', 'dirty', 'unavailable']);

function clone(value) {
  return structuredClone(value);
}

function validDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
}

function explicit(value, updatedAtIso) {
  return {
    value: clone(value),
    provenance: 'explicit-user-input',
    confidence: 1,
    updatedAtIso,
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function validateDay(day) {
  if (!validDate(day?.date)) return 'valid-plan-date-required';
  if (!String(day?.occasionCategory ?? '').trim()) return 'occasion-category-required';
  if (!String(day?.dressCode ?? '').trim()) return 'dress-code-required';
  if (!uniqueStrings(day?.climateTags).length) return 'climate-input-required';
  if (!uniqueStrings(day?.requiredCategories).length) return 'required-categories-required';
  return null;
}

export function createOutfitPlanningRequest(input, { nowIso }) {
  if (!input?.planId || !input?.profileRef || !input?.wardrobeSnapshotRef) {
    return { ok: false, error: 'plan-profile-and-wardrobe-required' };
  }
  if (!Number.isFinite(new Date(nowIso).getTime())) {
    return { ok: false, error: 'valid-current-time-required' };
  }
  if (!Array.isArray(input.days) || input.days.length === 0) {
    return { ok: false, error: 'at-least-one-plan-day-required' };
  }
  for (const day of input.days) {
    const error = validateDay(day);
    if (error) return { ok: false, error };
  }
  const dates = input.days.map((day) => day.date);
  if (new Set(dates).size !== dates.length) {
    return { ok: false, error: 'duplicate-plan-date' };
  }
  const maxUsesPerItem = Number(input.maxUsesPerItem ?? 2);
  const maxPackedItems = Number(input.maxPackedItems ?? 12);
  if (!Number.isInteger(maxUsesPerItem) || maxUsesPerItem < 1) {
    return { ok: false, error: 'invalid-repeat-limit' };
  }
  if (!Number.isInteger(maxPackedItems) || maxPackedItems < 1) {
    return { ok: false, error: 'invalid-packing-limit' };
  }

  return {
    ok: true,
    request: {
      schemaVersion: OUTFIT_PACKING_VERSION,
      planId: input.planId,
      version: 1,
      fixtureOnly: true,
      profileRef: input.profileRef,
      wardrobeSnapshotRef: input.wardrobeSnapshotRef,
      privateInputs: {
        days: explicit(input.days.map((day) => ({
          date: day.date,
          occasionCategory: String(day.occasionCategory).trim(),
          occasionNote: String(day.occasionNote ?? '').trim() || null,
          dressCode: String(day.dressCode).trim(),
          climateTags: uniqueStrings(day.climateTags),
          requiredCategories: uniqueStrings(day.requiredCategories),
        })), nowIso),
        preferredColors: explicit(uniqueStrings(input.preferredColors), nowIso),
        maxUsesPerItem: explicit(maxUsesPerItem, nowIso),
        maxPackedItems: explicit(maxPackedItems, nowIso),
        laundryAvailable: explicit(Boolean(input.laundryAvailable), nowIso),
        essentialItemIds: explicit(uniqueStrings(input.essentialItemIds), nowIso),
      },
      corrections: [],
      status: 'ready',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
  };
}

export function correctOutfitPlanningRequest(request, input, { nowIso }) {
  if (!request || request.schemaVersion !== OUTFIT_PACKING_VERSION) {
    return { ok: false, error: 'unsupported-planning-request' };
  }
  const nextInput = {
    planId: request.planId,
    profileRef: request.profileRef,
    wardrobeSnapshotRef: request.wardrobeSnapshotRef,
    days: input.days ?? request.privateInputs.days.value,
    preferredColors: input.preferredColors ?? request.privateInputs.preferredColors.value,
    maxUsesPerItem: input.maxUsesPerItem ?? request.privateInputs.maxUsesPerItem.value,
    maxPackedItems: input.maxPackedItems ?? request.privateInputs.maxPackedItems.value,
    laundryAvailable: input.laundryAvailable ?? request.privateInputs.laundryAvailable.value,
    essentialItemIds: input.essentialItemIds ?? request.privateInputs.essentialItemIds.value,
  };
  if (!Object.keys(input ?? {}).length) {
    return { ok: false, error: 'no-planning-correction' };
  }
  const recreated = createOutfitPlanningRequest(nextInput, { nowIso });
  if (!recreated.ok) return recreated;
  const next = recreated.request;
  next.version = request.version + 1;
  next.createdAtIso = request.createdAtIso;
  next.corrections = [
    ...clone(request.corrections),
    {
      correctionId: `${request.planId}-correction-v${next.version}`,
      version: next.version,
      correctedFields: Object.keys(input).sort(),
      provenance: 'explicit-user-correction',
      confidence: 1,
      correctedAtIso: nowIso,
    },
  ];
  for (const key of Object.keys(input)) {
    if (next.privateInputs[key]) {
      next.privateInputs[key].provenance = 'explicit-user-correction';
    }
  }
  return { ok: true, request: next };
}

function itemScore(item, day, preferredColors, useCount) {
  const dressMatch = item.dressCodes.includes(day.dressCode);
  const climateMatches = day.climateTags.filter((tag) => item.climateTags.includes(tag)).length;
  const colorMatch = item.colors.some((color) => preferredColors.includes(color));
  return (dressMatch ? 100 : 0) + (climateMatches * 10) + (colorMatch ? 2 : 0) - useCount;
}

function normalizeWardrobeItem(item) {
  return {
    itemId: String(item?.itemId ?? ''),
    productId: String(item?.productId ?? ''),
    confirmedExact: item?.confirmedExact === true,
    category: String(item?.category ?? ''),
    colors: uniqueStrings(item?.colors),
    climateTags: uniqueStrings(item?.climateTags),
    dressCodes: uniqueStrings(item?.dressCodes),
    state: item?.state ?? 'available',
  };
}

export function planFixtureOutfits(request, wardrobeItems) {
  if (!request || request.schemaVersion !== OUTFIT_PACKING_VERSION || request.status !== 'ready') {
    return { ok: false, error: 'active-planning-request-required' };
  }
  if (!Array.isArray(wardrobeItems)) return { ok: false, error: 'wardrobe-required' };

  const items = wardrobeItems.map(normalizeWardrobeItem);
  if (items.some((item) => !ITEM_STATES.includes(item.state))) {
    return { ok: false, error: 'unsupported-item-state' };
  }
  if (items.some((item) => !item.itemId || !item.productId || !item.category)) {
    return { ok: false, error: 'canonical-item-fields-required' };
  }
  if (new Set(items.map((item) => item.itemId)).size !== items.length) {
    return { ok: false, error: 'duplicate-wardrobe-item' };
  }

  const days = request.privateInputs.days.value;
  const preferredColors = request.privateInputs.preferredColors.value;
  const maxUses = request.privateInputs.maxUsesPerItem.value;
  const maxPacked = request.privateInputs.maxPackedItems.value;
  const useCounts = new Map();
  const outfits = [];
  const gaps = [];

  days.forEach((day, dayIndex) => {
    const selected = [];
    const opposingEvidence = [];
    for (const category of day.requiredCategories) {
      const candidates = items
        .filter((item) => item.category === category)
        .filter((item) => item.confirmedExact)
        .filter((item) => item.state === 'available')
        .filter((item) => item.dressCodes.includes(day.dressCode))
        .filter((item) => day.climateTags.some((tag) => item.climateTags.includes(tag)))
        .filter((item) => (useCounts.get(item.itemId) ?? 0) < maxUses)
        .sort((a, b) => {
          const scoreDifference = itemScore(
            b,
            day,
            preferredColors,
            useCounts.get(b.itemId) ?? 0,
          ) - itemScore(a, day, preferredColors, useCounts.get(a.itemId) ?? 0);
          return scoreDifference || a.itemId.localeCompare(b.itemId);
        });
      const selectedItem = candidates[0];
      if (!selectedItem) {
        const blocked = items
          .filter((item) => item.category === category)
          .map((item) => `${item.itemId}:${item.confirmedExact ? item.state : 'unconfirmed'}`)
          .sort();
        gaps.push({ dayIndex, category, reason: 'no-eligible-owned-item', blocked });
        opposingEvidence.push(`Missing eligible owned ${category}`);
        continue;
      }
      const priorUses = useCounts.get(selectedItem.itemId) ?? 0;
      useCounts.set(selectedItem.itemId, priorUses + 1);
      selected.push({
        itemId: selectedItem.itemId,
        productId: selectedItem.productId,
        category,
        reasons: [
          `Confirmed owned ${category}`,
          `Matches ${day.dressCode} dress code`,
          `Matches climate input: ${day.climateTags.filter((tag) => selectedItem.climateTags.includes(tag)).join(', ')}`,
          priorUses ? `Repeated within explicit ${maxUses}-use limit` : 'First use in this plan',
        ],
      });
    }
    outfits.push({
      dayIndex,
      dressCode: day.dressCode,
      climateTags: clone(day.climateTags),
      itemRefs: selected,
      complete: selected.length === day.requiredCategories.length,
      reasons: selected.length
        ? ['Uses confirmed owned items', 'Respects item state and repeat constraints']
        : [],
      opposingEvidence,
    });
  });

  const referencedItemIds = uniqueStrings(
    outfits.flatMap((outfit) => outfit.itemRefs.map((item) => item.itemId)),
  );
  const explicitEssentials = request.privateInputs.essentialItemIds.value;
  const validEssentials = explicitEssentials.filter((itemId) => {
    const item = items.find((candidate) => candidate.itemId === itemId);
    return item?.confirmedExact && item.state === 'available';
  });
  const packedItemIds = uniqueStrings([...referencedItemIds, ...validEssentials]);
  if (packedItemIds.length > maxPacked) {
    return {
      ok: false,
      error: 'packing-limit-exceeded',
      evidence: { requiredCount: packedItemIds.length, maxPackedItems: maxPacked },
    };
  }

  const requiredSlots = days.reduce((count, day) => count + day.requiredCategories.length, 0);
  const filledSlots = outfits.reduce((count, outfit) => count + outfit.itemRefs.length, 0);
  const coverage = requiredSlots ? filledSlots / requiredSlots : 0;
  return {
    ok: true,
    plan: {
      schemaVersion: OUTFIT_PACKING_VERSION,
      planId: request.planId,
      planVersion: request.version,
      fixtureOnly: true,
      wardrobeSnapshotRef: request.wardrobeSnapshotRef,
      status: gaps.length ? 'partial' : 'complete',
      outfits,
      packingList: packedItemIds.map((itemId) => ({
        itemId,
        reason: referencedItemIds.includes(itemId)
          ? 'referenced-by-planned-outfit'
          : 'explicit-user-essential',
      })),
      gaps,
      confidence: Number(coverage.toFixed(2)),
      evidence: {
        requiredSlots,
        filledSlots,
        confirmedOwnedItemsOnly: true,
        externalDataUsed: false,
      },
    },
  };
}

export function buildMinimizedOutfitPlan(plan) {
  if (!plan || plan.schemaVersion !== OUTFIT_PACKING_VERSION) {
    return { ok: false, error: 'valid-outfit-plan-required' };
  }
  return {
    ok: true,
    plan: {
      planId: plan.planId,
      planVersion: plan.planVersion,
      wardrobeSnapshotRef: plan.wardrobeSnapshotRef,
      status: plan.status,
      outfits: plan.outfits.map((outfit) => ({
        dayIndex: outfit.dayIndex,
        dressCode: outfit.dressCode,
        climateTags: clone(outfit.climateTags),
        itemRefs: outfit.itemRefs.map(({ itemId, productId, category, reasons }) => ({
          itemId,
          productId,
          category,
          reasons: clone(reasons),
        })),
        complete: outfit.complete,
        reasons: clone(outfit.reasons),
        opposingEvidence: clone(outfit.opposingEvidence),
      })),
      packingList: clone(plan.packingList),
      gaps: clone(plan.gaps),
      confidence: plan.confidence,
    },
  };
}

export function invalidateOutfitPlanningRequest(request, { nowIso, reason = 'deleted' }) {
  if (!request || request.schemaVersion !== OUTFIT_PACKING_VERSION) {
    return { ok: false, error: 'unsupported-planning-request' };
  }
  const next = clone(request);
  next.version += 1;
  next.status = 'invalidated';
  next.privateInputs = null;
  next.invalidatedAtIso = nowIso;
  next.invalidationReason = reason;
  next.updatedAtIso = nowIso;
  return { ok: true, request: next };
}
