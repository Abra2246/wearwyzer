import { products as canonicalProducts } from '../data/products.js';
import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const CLOSET_HEALTH_VERSION = 'closet-health-v1';
export const CLOSET_HEALTH_WEIGHTS = Object.freeze({
  roleBalance: 0.3,
  versatility: 0.3,
  redundancyHealth: 0.2,
  wearUtilization: 0.2,
});
const ESSENTIAL_ROLES = Object.freeze(['top', 'bottom', 'footwear']);
const WEAR_STATES = new Set(['active', 'never-worn', 'forgotten']);
const WEAR_COUNT_BUCKETS = new Set(['0', '1-4', '5-14', '15+']);
const RECENCY_BUCKETS = new Set(['never', '0-30-days', '31-180-days', '181+-days']);
const CONDITIONS = new Set(['new', 'excellent', 'good', 'worn', 'repair-needed']);
const EVIDENCE_KEYS = new Set([
  'itemId',
  'lifecycleVersion',
  'wearState',
  'wearCountBucket',
  'recencyBucket',
  'condition',
]);

function roleFor(categoryId) {
  if (['shirts', 'hoodies'].includes(categoryId)) return 'top';
  if (categoryId === 'pants') return 'bottom';
  if (['shoes', 'sneakers'].includes(categoryId)) return 'footwear';
  if (categoryId === 'outerwear') return 'outerwear';
  return 'accessory';
}

function validWearEvidence(evidence) {
  if (!(evidence && typeof evidence === 'object' && !Array.isArray(evidence)
    && Object.keys(evidence).every((key) => EVIDENCE_KEYS.has(key))
    && Object.keys(evidence).length === EVIDENCE_KEYS.size
    && typeof evidence.itemId === 'string'
    && evidence.itemId.trim().length > 0
    && Number.isInteger(evidence.lifecycleVersion)
    && evidence.lifecycleVersion > 0
    && WEAR_STATES.has(evidence.wearState)
    && WEAR_COUNT_BUCKETS.has(evidence.wearCountBucket)
    && RECENCY_BUCKETS.has(evidence.recencyBucket)
    && CONDITIONS.has(evidence.condition))) {
    return false;
  }
  if (evidence.wearState === 'never-worn') {
    return evidence.wearCountBucket === '0' && evidence.recencyBucket === 'never';
  }
  if (evidence.wearState === 'forgotten') {
    return evidence.wearCountBucket !== '0' && evidence.recencyBucket === '181+-days';
  }
  return evidence.wearCountBucket !== '0' && evidence.recencyBucket !== 'never';
}

function bounded(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function weightedAvailableScore(components) {
  const available = Object.entries(components).filter(([, value]) => value !== null);
  const weight = available.reduce((sum, [key]) => sum + CLOSET_HEALTH_WEIGHTS[key], 0);
  return bounded(
    available.reduce(
      (sum, [key, value]) => sum + value * CLOSET_HEALTH_WEIGHTS[key],
      0,
    ) / weight,
  );
}

export function scoreClosetHealth({
  wardrobeItems,
  wearEvidence = [],
  catalog = canonicalProducts,
}) {
  if (!Array.isArray(wardrobeItems) || wardrobeItems.length === 0) {
    return { ok: false, error: 'confirmed-wardrobe-required' };
  }
  const itemIds = wardrobeItems.map((item) => item?.itemId);
  if (new Set(itemIds).size !== itemIds.length
    || wardrobeItems.some(
      (item) => !item?.itemId || !item?.productId || item.confirmedExact !== true,
    )) {
    return { ok: false, error: 'unique-confirmed-items-required' };
  }
  if (!Array.isArray(wearEvidence)
    || wearEvidence.some((evidence) => !validWearEvidence(evidence))
    || new Set(wearEvidence.map(({ itemId }) => itemId)).size !== wearEvidence.length
    || wearEvidence.some(({ itemId }) => !itemIds.includes(itemId))) {
    return { ok: false, error: 'valid-minimized-wear-evidence-required' };
  }

  const catalogById = new Map(catalog.map((product) => [product.id, product]));
  const resolved = wardrobeItems
    .map((item) => ({ item, product: catalogById.get(item.productId) }))
    .filter(({ product }) => product);
  const unresolvedItemIds = wardrobeItems
    .filter((item) => !catalogById.has(item.productId))
    .map(({ itemId }) => itemId)
    .sort();
  const roles = new Set(resolved.map(({ product }) => roleFor(product.categoryId)));
  const missingRoles = ESSENTIAL_ROLES.filter((role) => !roles.has(role));
  const roleBalance = bounded(
    ((ESSENTIAL_ROLES.length - missingRoles.length) / ESSENTIAL_ROLES.length) * 100,
  );
  const categories = new Set(resolved.map(({ product }) => product.categoryId));
  const tags = new Set(resolved.flatMap(({ product }) => product.tags ?? []));
  const versatility = bounded(categories.size * 12 + Math.min(tags.size, 10) * 5);

  const duplicateGroups = [];
  const groups = new Map();
  for (const { item, product } of resolved) {
    const key = `${product.categoryId}:${String(product.colorway ?? '').toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.itemId);
  }
  for (const refs of groups.values()) {
    if (refs.length > 1) duplicateGroups.push([...refs].sort());
  }
  duplicateGroups.sort((left, right) => left[0].localeCompare(right[0]));
  const redundancyHealth = bounded(100 - duplicateGroups.length * 20);

  const wearByItem = new Map(wearEvidence.map((evidence) => [evidence.itemId, evidence]));
  const evidenced = wardrobeItems
    .map(({ itemId }) => wearByItem.get(itemId))
    .filter(Boolean);
  const wearUtilization = evidenced.length
    ? bounded(evidenced.reduce((sum, evidence) => (
      sum + (evidence.wearState === 'active' ? 100 : evidence.wearState === 'never-worn' ? 50 : 20)
    ), 0) / evidenced.length)
    : null;
  const forgottenItemIds = evidenced
    .filter(({ wearState }) => wearState === 'forgotten')
    .map(({ itemId }) => itemId)
    .sort();
  const neverWornItemIds = evidenced
    .filter(({ wearState }) => wearState === 'never-worn')
    .map(({ itemId }) => itemId)
    .sort();
  const repairItemIds = evidenced
    .filter(({ condition }) => condition === 'repair-needed')
    .map(({ itemId }) => itemId)
    .sort();
  const missingWearEvidenceItemIds = itemIds
    .filter((itemId) => !wearByItem.has(itemId))
    .sort();

  const components = { roleBalance, versatility, redundancyHealth, wearUtilization };
  const evidenceCoverage = bounded(
    ((resolved.length + evidenced.length) / (wardrobeItems.length * 2)) * 100,
  );
  const actions = [
    ...repairItemIds.map((itemId) => ({ action: 'repair-owned-item', itemIds: [itemId] })),
    ...forgottenItemIds.map((itemId) => ({ action: 'rediscover-owned-item', itemIds: [itemId] })),
    ...neverWornItemIds.map((itemId) => ({ action: 'style-never-worn-item', itemIds: [itemId] })),
    ...duplicateGroups.map((refs) => ({ action: 'rotate-similar-owned-items', itemIds: refs })),
    ...missingRoles.map((role) => ({ action: 'review-confirmed-role-gap', role, itemIds: [] })),
    ...(missingWearEvidenceItemIds.length
      ? [{ action: 'add-explicit-wear-evidence', itemIds: missingWearEvidenceItemIds }]
      : []),
    ...(unresolvedItemIds.length
      ? [{ action: 'correct-unresolved-owned-items', itemIds: unresolvedItemIds }]
      : []),
  ];

  return {
    ok: true,
    health: {
      schemaVersion: CLOSET_HEALTH_VERSION,
      score: weightedAvailableScore(components),
      confidence: evidenceCoverage >= 85 ? 'high' : evidenceCoverage >= 60 ? 'medium' : 'low',
      evidenceCoverage,
      components,
      evidence: {
        confirmedItemCount: wardrobeItems.length,
        resolvedItemCount: resolved.length,
        wearEvidenceCount: evidenced.length,
        missingRoles,
        duplicateGroups,
        forgottenItemIds,
        neverWornItemIds,
        repairItemIds,
        missingWearEvidenceItemIds,
        unresolvedItemIds,
      },
      prioritizedActions: actions,
    },
  };
}

export function serializeClosetHealth(health) {
  return stableSerialize(health);
}
