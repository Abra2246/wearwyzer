import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const FIT_INTELLIGENCE_VERSION = 'fit-intelligence-v1';
export const FIT_EVIDENCE_MAX_AGE_DAYS = 30;

const PROFILE_KEYS = new Set(['profileVersion', 'category', 'targetFit', 'usualSize', 'knownBrandFits']);
const SIZE_KEYS = new Set(['system', 'value']);
const KNOWN_FIT_KEYS = new Set([
  'itemId',
  'brandId',
  'category',
  'sizeSystem',
  'size',
  'outcome',
  'source',
]);
const EVIDENCE_KEYS = new Set([
  'evidenceVersion',
  'productId',
  'brandId',
  'category',
  'state',
  'verifiedAtIso',
  'sizeSystem',
  'availableSizes',
  'fitTendency',
  'regionalConversions',
]);
const TARGET_FITS = new Set(['slim', 'regular', 'relaxed']);
const FIT_OUTCOMES = new Set(['too-small', 'as-preferred', 'too-large']);
const FIT_SOURCES = new Set(['explicit-correction', 'inferred']);
const EVIDENCE_STATES = new Set(['current', 'stale', 'ambiguous', 'conflicting', 'missing']);
const FIT_TENDENCIES = new Set(['runs-small', 'true-to-size', 'runs-large', 'unknown']);
const ALPHA_SIZES = Object.freeze(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']);

function exactKeys(value, allowed) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === allowed.size
    && Object.keys(value).every((key) => allowed.has(key));
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function uniqueNonempty(values) {
  return Array.isArray(values)
    && values.length > 0
    && values.every(nonempty)
    && new Set(values).size === values.length;
}

function validProfile(profile) {
  if (!exactKeys(profile, PROFILE_KEYS)
    || !Number.isInteger(profile.profileVersion)
    || profile.profileVersion < 1
    || !nonempty(profile.category)
    || !TARGET_FITS.has(profile.targetFit)
    || !exactKeys(profile.usualSize, SIZE_KEYS)
    || !nonempty(profile.usualSize.system)
    || !nonempty(profile.usualSize.value)
    || !Array.isArray(profile.knownBrandFits)) {
    return false;
  }
  return profile.knownBrandFits.every((fit) => (
    exactKeys(fit, KNOWN_FIT_KEYS)
    && nonempty(fit.itemId)
    && nonempty(fit.brandId)
    && nonempty(fit.category)
    && nonempty(fit.sizeSystem)
    && nonempty(fit.size)
    && FIT_OUTCOMES.has(fit.outcome)
    && FIT_SOURCES.has(fit.source)
  ));
}

function validConversions(conversions, availableSizes) {
  if (!conversions || typeof conversions !== 'object' || Array.isArray(conversions)) return false;
  return Object.entries(conversions).every(([size, regions]) => (
    availableSizes.includes(size)
    && regions
    && typeof regions === 'object'
    && !Array.isArray(regions)
    && Object.keys(regions).length > 0
    && Object.entries(regions).every(([region, value]) => nonempty(region) && nonempty(value))
  ));
}

function validEvidence(evidence) {
  return exactKeys(evidence, EVIDENCE_KEYS)
    && Number.isInteger(evidence.evidenceVersion)
    && evidence.evidenceVersion > 0
    && nonempty(evidence.productId)
    && nonempty(evidence.brandId)
    && nonempty(evidence.category)
    && EVIDENCE_STATES.has(evidence.state)
    && validIso(evidence.verifiedAtIso)
    && evidence.sizeSystem === 'alpha'
    && uniqueNonempty(evidence.availableSizes)
    && evidence.availableSizes.every((size) => ALPHA_SIZES.includes(size))
    && FIT_TENDENCIES.has(evidence.fitTendency)
    && validConversions(evidence.regionalConversions, evidence.availableSizes);
}

function ageDays(verifiedAtIso, nowIso) {
  return (new Date(nowIso) - new Date(verifiedAtIso)) / 86_400_000;
}

function shiftAlpha(size, delta) {
  const index = ALPHA_SIZES.indexOf(size);
  if (index < 0) return null;
  return ALPHA_SIZES[index + delta] ?? null;
}

function minimizedComparison(fit) {
  return {
    itemId: fit.itemId,
    size: fit.size,
    outcome: fit.outcome,
    source: fit.source,
  };
}

function abstain(status, reasonCodes, evidence, comparisons = []) {
  return {
    ok: true,
    result: {
      schemaVersion: FIT_INTELLIGENCE_VERSION,
      status,
      recommendedSize: null,
      confidence: 'none',
      expectedSilhouette: null,
      likelyIssues: [],
      regionalConversions: {},
      ownedItemComparisons: comparisons.map(minimizedComparison),
      reasonCodes,
      evidence: {
        productId: evidence.productId,
        evidenceVersion: evidence.evidenceVersion,
        verifiedAtIso: evidence.verifiedAtIso,
        state: evidence.state,
      },
      guidanceNotice: 'Guidance only. Fit can vary by body, material, construction, and preference.',
    },
  };
}

export function recommendFixtureFit({ profile, productEvidence, nowIso }) {
  if (!validIso(nowIso)) return { ok: false, error: 'valid-current-time-required' };
  if (!validProfile(profile)) return { ok: false, error: 'valid-minimized-fit-profile-required' };
  if (!validEvidence(productEvidence)) {
    return { ok: false, error: 'valid-verified-size-evidence-required' };
  }
  if (profile.category !== productEvidence.category
    || profile.usualSize.system !== productEvidence.sizeSystem) {
    return { ok: false, error: 'profile-and-product-size-system-mismatch' };
  }

  const sameBrand = profile.knownBrandFits
    .filter((fit) => fit.brandId === productEvidence.brandId
      && fit.category === productEvidence.category
      && fit.sizeSystem === productEvidence.sizeSystem)
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
  const explicitPreferred = sameBrand.filter(
    (fit) => fit.source === 'explicit-correction' && fit.outcome === 'as-preferred',
  );
  const preferredSizes = [...new Set(explicitPreferred.map(({ size }) => size))];

  if (productEvidence.state !== 'current') {
    return abstain(`${productEvidence.state}-evidence`, [
      `product-evidence-${productEvidence.state}`,
    ], productEvidence, sameBrand);
  }
  if (ageDays(productEvidence.verifiedAtIso, nowIso) > FIT_EVIDENCE_MAX_AGE_DAYS
    || ageDays(productEvidence.verifiedAtIso, nowIso) < 0) {
    return abstain('stale-evidence', ['product-size-evidence-outside-freshness-window'], productEvidence, sameBrand);
  }
  if (preferredSizes.length > 1) {
    return abstain('conflicting-fit-evidence', [
      'explicit-same-brand-corrections-conflict',
    ], productEvidence, sameBrand);
  }

  const reasonCodes = [];
  const likelyIssues = [];
  let recommendedSize = preferredSizes[0] ?? profile.usualSize.value;
  let confidence = preferredSizes.length ? 'high' : 'medium';

  if (preferredSizes.length) {
    reasonCodes.push('explicit-same-brand-correction-used');
  } else {
    reasonCodes.push('usual-size-transferred-across-product');
    likelyIssues.push('cross-product-size-transfer');
    const adjustment = productEvidence.fitTendency === 'runs-small'
      ? 1
      : productEvidence.fitTendency === 'runs-large'
        ? -1
        : 0;
    if (adjustment !== 0) {
      const shifted = shiftAlpha(recommendedSize, adjustment);
      if (!shifted) {
        return abstain('insufficient-evidence', [
          'size-adjustment-outside-supported-range',
        ], productEvidence, sameBrand);
      }
      recommendedSize = shifted;
      reasonCodes.push(adjustment > 0 ? 'verified-runs-small-size-up' : 'verified-runs-large-size-down');
    } else if (productEvidence.fitTendency === 'unknown') {
      confidence = 'low';
      likelyIssues.push('product-fit-tendency-unknown');
      reasonCodes.push('usual-size-only');
    } else {
      reasonCodes.push('verified-true-to-size');
    }
  }

  if (!ALPHA_SIZES.includes(recommendedSize)) {
    return abstain('insufficient-evidence', [
      'usual-size-outside-supported-system',
    ], productEvidence, sameBrand);
  }
  if (!productEvidence.availableSizes.includes(recommendedSize)) {
    return abstain('recommended-size-unavailable', [
      'evidence-supported-size-not-currently-available',
    ], productEvidence, sameBrand);
  }

  return {
    ok: true,
    result: {
      schemaVersion: FIT_INTELLIGENCE_VERSION,
      status: 'guidance-available',
      recommendedSize,
      confidence,
      expectedSilhouette: profile.targetFit,
      likelyIssues,
      regionalConversions: structuredClone(
        productEvidence.regionalConversions[recommendedSize] ?? {},
      ),
      ownedItemComparisons: sameBrand.map(minimizedComparison),
      reasonCodes,
      evidence: {
        productId: productEvidence.productId,
        evidenceVersion: productEvidence.evidenceVersion,
        verifiedAtIso: productEvidence.verifiedAtIso,
        state: productEvidence.state,
      },
      guidanceNotice: 'Guidance only. Fit can vary by body, material, construction, and preference.',
    },
  };
}

export function serializeFitGuidance(result) {
  return stableSerialize(result);
}
