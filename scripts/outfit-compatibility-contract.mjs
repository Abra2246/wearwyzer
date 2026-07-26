import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const OUTFIT_COMPATIBILITY_VERSION = 'outfit-compatibility-v1';

const INPUT_KEYS = new Set([
  'outfitId',
  'evidenceVersion',
  'styleDnaVersion',
  'styleSignals',
  'target',
  'items',
]);
const TARGET_KEYS = new Set(['occasion', 'season']);
const STYLE_SIGNAL_KEYS = new Set([
  'dimension',
  'value',
  'sentiment',
  'source',
  'confidence',
  'evidenceCode',
]);
const ITEM_KEYS = new Set([
  'itemId',
  'productId',
  'ownership',
  'role',
  'evidenceState',
  'aesthetics',
  'palette',
  'silhouette',
  'formality',
  'materials',
  'occasions',
  'seasons',
  'layering',
  'riskLevel',
  'fitStatus',
]);
const DIMENSIONS = new Set([
  'aesthetic',
  'palette',
  'silhouette',
  'formality',
  'layering',
  'material',
  'occasion',
  'risk-tolerance',
]);
const SENTIMENTS = new Set(['positive', 'negative']);
const SOURCES = new Set(['explicit-user', 'explicit-correction', 'inferred']);
const OWNERSHIP = new Set(['owned', 'prospective', 'missing']);
const ROLES = new Set(['top', 'bottom', 'footwear', 'outerwear', 'accessory']);
const REQUIRED_ROLES = Object.freeze(['top', 'bottom', 'footwear']);
const EVIDENCE_STATES = new Set(['current', 'stale', 'unknown']);
const FIT_STATUSES = new Set(['verified', 'unknown', 'not-applicable', 'conflicting']);
const LAYERING = new Set(['base', 'mid-layer', 'outer-layer', 'not-applicable']);
const RISK_LEVELS = new Set(['classic', 'balanced', 'experimental']);

function exactKeys(value, keys) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value) {
  return Array.isArray(value)
    && value.every(nonempty)
    && new Set(value).size === value.length;
}

function validStyleSignal(signal) {
  return exactKeys(signal, STYLE_SIGNAL_KEYS)
    && DIMENSIONS.has(signal.dimension)
    && nonempty(signal.value)
    && SENTIMENTS.has(signal.sentiment)
    && SOURCES.has(signal.source)
    && Number.isFinite(signal.confidence)
    && signal.confidence >= 0
    && signal.confidence <= 1
    && nonempty(signal.evidenceCode);
}

function validItem(item) {
  return exactKeys(item, ITEM_KEYS)
    && nonempty(item.itemId)
    && nonempty(item.productId)
    && OWNERSHIP.has(item.ownership)
    && ROLES.has(item.role)
    && EVIDENCE_STATES.has(item.evidenceState)
    && stringArray(item.aesthetics)
    && stringArray(item.palette)
    && nonempty(item.silhouette)
    && nonempty(item.formality)
    && stringArray(item.materials)
    && stringArray(item.occasions)
    && stringArray(item.seasons)
    && LAYERING.has(item.layering)
    && RISK_LEVELS.has(item.riskLevel)
    && FIT_STATUSES.has(item.fitStatus);
}

function validInput(input) {
  if (!exactKeys(input, INPUT_KEYS)
    || !nonempty(input.outfitId)
    || !Number.isInteger(input.evidenceVersion)
    || input.evidenceVersion < 1
    || !nonempty(input.styleDnaVersion)
    || !Array.isArray(input.styleSignals)
    || !input.styleSignals.every(validStyleSignal)
    || !exactKeys(input.target, TARGET_KEYS)
    || !nonempty(input.target.occasion)
    || !nonempty(input.target.season)
    || !Array.isArray(input.items)
    || input.items.length < 3
    || input.items.length > 5
    || !input.items.every(validItem)) {
    return false;
  }
  return new Set(input.styleSignals.map(({ dimension, value }) => `${dimension}\u0000${value}`)).size
      === input.styleSignals.length
    && new Set(input.items.map(({ itemId }) => itemId)).size === input.items.length
    && new Set(input.items.map(({ productId }) => productId)).size === input.items.length
    && REQUIRED_ROLES.every((role) => input.items.filter((item) => item.role === role).length === 1)
    && input.items.filter((item) => item.role === 'outerwear').length <= 1;
}

function valuesFor(item, dimension) {
  if (dimension === 'aesthetic') return item.aesthetics;
  if (dimension === 'palette') return item.palette;
  if (dimension === 'silhouette') return [item.silhouette];
  if (dimension === 'formality') return [item.formality];
  if (dimension === 'layering') return [item.layering];
  if (dimension === 'material') return item.materials;
  if (dimension === 'occasion') return item.occasions;
  if (dimension === 'risk-tolerance') return [item.riskLevel];
  return [];
}

function matchingItems(items, signal) {
  return items.filter((item) => valuesFor(item, signal.dimension).includes(signal.value));
}

function scoreForDimension(items, signals, dimension) {
  const positive = signals.filter(
    (signal) => signal.dimension === dimension && signal.sentiment === 'positive',
  );
  if (!positive.length) return null;
  const matched = items.filter((item) => positive.some(
    (signal) => valuesFor(item, dimension).includes(signal.value),
  ));
  return Math.round((matched.length / items.length) * 100);
}

function weightedAverage(parts) {
  const weights = {
    palette: 0.16,
    silhouette: 0.14,
    formality: 0.14,
    material: 0.1,
    occasion: 0.14,
    layering: 0.08,
    verifiedFit: 0.12,
    ownedPairing: 0.12,
  };
  const available = Object.entries(parts).filter(([, value]) => value !== null);
  if (!available.length) return null;
  const weight = available.reduce((sum, [key]) => sum + weights[key], 0);
  return Math.round(
    available.reduce((sum, [key, value]) => sum + value * weights[key], 0) / weight,
  );
}

function confidenceFor(coverage, hardIncompatibilities) {
  if (hardIncompatibilities.length) return 'high';
  if (coverage >= 85) return 'high';
  if (coverage >= 60) return 'moderate';
  return 'low';
}

function itemReference(item) {
  return {
    itemId: item.itemId,
    productId: item.productId,
    ownership: item.ownership,
    role: item.role,
    evidenceState: item.evidenceState,
    fitStatus: item.fitStatus,
  };
}

export function evaluateOutfitCompatibility(input) {
  if (!validInput(input)) {
    return { ok: false, error: 'valid-minimized-outfit-evidence-required' };
  }

  const hardIncompatibilities = [];
  const missingEvidence = [];
  const reasonCodes = [];

  for (const item of input.items) {
    if (item.evidenceState !== 'current') {
      missingEvidence.push(`${item.itemId}:product-evidence-${item.evidenceState}`);
    }
    if (item.fitStatus === 'conflicting') {
      hardIncompatibilities.push(`${item.itemId}:fit-evidence-conflicting`);
    } else if (item.fitStatus === 'unknown') {
      missingEvidence.push(`${item.itemId}:fit-evidence-unknown`);
    }
    if (REQUIRED_ROLES.includes(item.role) && item.ownership === 'missing') {
      hardIncompatibilities.push(`${item.itemId}:required-role-not-owned-or-prospective`);
    }
    if (REQUIRED_ROLES.includes(item.role)
      && !item.occasions.includes(input.target.occasion)) {
      hardIncompatibilities.push(`${item.itemId}:target-occasion-unsupported`);
    }
    if (REQUIRED_ROLES.includes(item.role)
      && !item.seasons.includes(input.target.season)) {
      hardIncompatibilities.push(`${item.itemId}:target-season-unsupported`);
    }
  }

  for (const signal of input.styleSignals) {
    if (signal.sentiment !== 'negative') continue;
    const matches = matchingItems(input.items, signal);
    if (matches.length && SOURCES.has(signal.source)) {
      const explicit = signal.source !== 'inferred';
      if (explicit) {
        hardIncompatibilities.push(
          ...matches.map((item) => `${item.itemId}:explicit-negative-${signal.dimension}`),
        );
      } else {
        reasonCodes.push(`inferred-negative-${signal.dimension}-not-a-hard-block`);
      }
    }
  }

  const currentItems = input.items.filter(({ evidenceState }) => evidenceState === 'current');
  const fitEligible = currentItems.filter(({ fitStatus }) => fitStatus !== 'not-applicable');
  const verifiedFit = fitEligible.length
    ? fitEligible.every(({ fitStatus }) => fitStatus === 'verified') ? 100 : null
    : null;
  const ownedSupporting = input.items.filter(
    ({ ownership, role }) => ownership === 'owned' && role !== 'accessory',
  ).length;
  const supportingSlots = input.items.filter(({ role }) => role !== 'accessory').length - 1;
  const parts = {
    palette: scoreForDimension(currentItems, input.styleSignals, 'palette'),
    silhouette: scoreForDimension(currentItems, input.styleSignals, 'silhouette'),
    formality: scoreForDimension(currentItems, input.styleSignals, 'formality'),
    material: scoreForDimension(currentItems, input.styleSignals, 'material'),
    occasion: Math.round(
      (currentItems.filter((item) => item.occasions.includes(input.target.occasion)).length
        / currentItems.length) * 100,
    ),
    layering: input.items.some(({ role }) => role === 'outerwear')
      ? scoreForDimension(currentItems, input.styleSignals, 'layering')
      : null,
    verifiedFit,
    ownedPairing: Math.round(
      (Math.min(ownedSupporting, Math.max(supportingSlots, 1))
        / Math.max(supportingSlots, 1)) * 100,
    ),
  };
  const availableParts = Object.values(parts).filter((value) => value !== null).length;
  const evidenceCoverage = Math.round((availableParts / Object.keys(parts).length) * 100);
  const score = hardIncompatibilities.length ? null : weightedAverage(parts);

  if (score !== null) {
    if (score >= 80) reasonCodes.push('strong-outfit-compatibility');
    else if (score >= 60) reasonCodes.push('moderate-outfit-compatibility');
    else reasonCodes.push('weak-outfit-compatibility');
  }
  if (ownedSupporting >= 2) reasonCodes.push('owned-first-outfit');
  if (missingEvidence.length) reasonCodes.push('confidence-lowered-by-missing-evidence');

  return {
    ok: true,
    result: {
      schemaVersion: OUTFIT_COMPATIBILITY_VERSION,
      outfitId: input.outfitId,
      evidenceVersion: input.evidenceVersion,
      styleDnaVersion: input.styleDnaVersion,
      status: hardIncompatibilities.length
        ? 'incompatible'
        : score === null
          ? 'insufficient-evidence'
          : missingEvidence.length
            ? 'review-required'
            : 'compatible',
      score,
      evidenceCoverage,
      confidence: confidenceFor(evidenceCoverage, hardIncompatibilities),
      target: { ...input.target },
      parts,
      hardIncompatibilities: [...new Set(hardIncompatibilities)].sort(),
      missingEvidence: [...new Set(missingEvidence)].sort(),
      reasonCodes: [...new Set(reasonCodes)].sort(),
      items: input.items.map(itemReference),
      policy: {
        explicitNegativeSignalsMayBlock: true,
        inferredNegativeSignalsMayBlock: false,
        missingEvidenceLowersConfidence: true,
        fitAndProductTruthOutrankPreference: true,
        commercialInfluenceAllowed: false,
      },
    },
  };
}

export function compareOutfitCompatibility(inputs) {
  if (!Array.isArray(inputs)
    || inputs.length < 2
    || inputs.length > 3
    || new Set(inputs.map(({ outfitId }) => outfitId)).size !== inputs.length) {
    return { ok: false, error: 'two-or-three-unique-outfits-required' };
  }
  const evaluated = inputs.map(evaluateOutfitCompatibility);
  if (evaluated.some(({ ok }) => !ok)) {
    return { ok: false, error: 'all-outfit-evidence-must-be-valid' };
  }
  const evaluations = evaluated.map(({ result }) => result);
  const qualified = evaluations.filter(
    ({ status, score }) => ['compatible', 'review-required'].includes(status)
      && Number.isFinite(score),
  );
  if (!qualified.length) {
    return {
      ok: true,
      result: {
        status: 'none-qualified',
        selectedOutfitIds: [],
        topScore: null,
        evaluations,
      },
    };
  }
  const topScore = Math.max(...qualified.map(({ score }) => score));
  const leaders = qualified
    .filter(({ score }) => score === topScore)
    .map(({ outfitId }) => outfitId)
    .sort();
  return {
    ok: true,
    result: {
      status: leaders.length > 1 ? 'tie' : 'selected',
      selectedOutfitIds: leaders,
      topScore,
      evaluations,
    },
  };
}

export function serializeOutfitCompatibility(result) {
  return stableSerialize(result);
}
