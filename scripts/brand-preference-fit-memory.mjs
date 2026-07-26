import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const BRAND_MEMORY_VERSION = 'brand-preference-fit-memory-v1';
export const BRAND_ROLES = Object.freeze([
  'favorite',
  'avoided',
  'best-fitting',
  'most-worn',
  'aspirational',
]);

const ROLE_SET = new Set(BRAND_ROLES);
const INPUT_KEYS = new Set([
  'profileVersion',
  'explicitRoles',
  'inferredSignals',
  'corrections',
  'fitMemory',
]);
const EXPLICIT_KEYS = new Set(['brandId', 'role', 'source']);
const INFERRED_KEYS = new Set(['brandId', 'signal', 'confidence', 'evidenceCode']);
const CORRECTION_KEYS = new Set([
  'correctionId',
  'version',
  'brandId',
  'role',
  'action',
]);
const FIT_KEYS = new Set([
  'itemId',
  'brandId',
  'category',
  'size',
  'outcome',
  'source',
]);
const SIGNAL_TO_ROLE = Object.freeze({
  'favorite-likelihood': 'favorite',
  'best-fit-likelihood': 'best-fitting',
  'most-worn-likelihood': 'most-worn',
  'aspirational-likelihood': 'aspirational',
});
const SIGNALS = new Set(Object.keys(SIGNAL_TO_ROLE));
const EVIDENCE_CODES = new Set([
  'wardrobe-frequency',
  'fit-feedback',
  'saved-style-selection',
  'explicit-style-exploration',
]);
const FIT_OUTCOMES = new Set(['too-small', 'as-preferred', 'too-large']);
const FIT_SOURCES = new Set(['explicit-user', 'explicit-correction']);
const ACTIONS = new Set(['add', 'remove']);
const INFERENCE_THRESHOLD = 0.7;

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

function validInput(input) {
  if (!exactKeys(input, INPUT_KEYS)
    || !Number.isInteger(input.profileVersion)
    || input.profileVersion < 1
    || !Array.isArray(input.explicitRoles)
    || !Array.isArray(input.inferredSignals)
    || !Array.isArray(input.corrections)
    || !Array.isArray(input.fitMemory)) {
    return false;
  }
  if (!input.explicitRoles.every((role) => (
    exactKeys(role, EXPLICIT_KEYS)
    && nonempty(role.brandId)
    && ROLE_SET.has(role.role)
    && role.source === 'explicit-user'
  ))) return false;
  if (!input.inferredSignals.every((signal) => (
    exactKeys(signal, INFERRED_KEYS)
    && nonempty(signal.brandId)
    && SIGNALS.has(signal.signal)
    && Number.isFinite(signal.confidence)
    && signal.confidence >= 0
    && signal.confidence <= 1
    && EVIDENCE_CODES.has(signal.evidenceCode)
  ))) return false;
  if (!input.corrections.every((correction) => (
    exactKeys(correction, CORRECTION_KEYS)
    && nonempty(correction.correctionId)
    && Number.isInteger(correction.version)
    && correction.version > 0
    && nonempty(correction.brandId)
    && ROLE_SET.has(correction.role)
    && ACTIONS.has(correction.action)
  ))) return false;
  if (!input.fitMemory.every((memory) => (
    exactKeys(memory, FIT_KEYS)
    && nonempty(memory.itemId)
    && nonempty(memory.brandId)
    && nonempty(memory.category)
    && nonempty(memory.size)
    && FIT_OUTCOMES.has(memory.outcome)
    && FIT_SOURCES.has(memory.source)
  ))) return false;
  return new Set(input.inferredSignals.map(({ brandId, signal }) => `${brandId}\u0000${signal}`)).size
      === input.inferredSignals.length
    && new Set(input.corrections.map(({ correctionId }) => correctionId)).size
      === input.corrections.length
    && new Set(input.fitMemory.map(({ itemId }) => itemId)).size === input.fitMemory.length;
}

function roleKey(brandId, role) {
  return `${brandId}\u0000${role}`;
}

function roleRecord({ role, source, confidence, evidenceCodes }) {
  return {
    role,
    source,
    confidence,
    evidenceCodes: [...evidenceCodes].sort(),
  };
}

function minimizedFitMemory(memory) {
  return {
    itemId: memory.itemId,
    category: memory.category,
    size: memory.size,
    outcome: memory.outcome,
    source: memory.source,
  };
}

export function buildBrandPreferenceFitMemory(input) {
  if (!validInput(input)) {
    return { ok: false, error: 'valid-minimized-brand-memory-evidence-required' };
  }

  const roleStates = new Map();
  for (const explicit of input.explicitRoles) {
    const key = roleKey(explicit.brandId, explicit.role);
    if (roleStates.has(key)) {
      return { ok: false, error: 'duplicate-explicit-brand-role' };
    }
    roleStates.set(key, {
      brandId: explicit.brandId,
      role: explicit.role,
      source: 'explicit-user',
      confidence: 1,
      evidenceCodes: ['explicit-user-selection'],
    });
  }

  const corrections = [...input.corrections].sort(
    (left, right) => left.version - right.version
      || left.correctionId.localeCompare(right.correctionId),
  );
  const correctionVersions = new Map();
  for (const correction of corrections) {
    const key = roleKey(correction.brandId, correction.role);
    const priorVersion = correctionVersions.get(key) ?? 0;
    if (correction.version <= priorVersion) {
      return { ok: false, error: 'non-increasing-brand-correction-version' };
    }
    correctionVersions.set(key, correction.version);
    if (correction.action === 'remove') {
      roleStates.delete(key);
    } else {
      roleStates.set(key, {
        brandId: correction.brandId,
        role: correction.role,
        source: 'explicit-correction',
        confidence: 1,
        evidenceCodes: [`correction-${correction.version}-add`],
      });
    }
  }

  for (const inferred of input.inferredSignals) {
    if (inferred.confidence < INFERENCE_THRESHOLD) continue;
    const role = SIGNAL_TO_ROLE[inferred.signal];
    const key = roleKey(inferred.brandId, role);
    if (!roleStates.has(key)) {
      roleStates.set(key, {
        brandId: inferred.brandId,
        role,
        source: 'inferred',
        confidence: inferred.confidence,
        evidenceCodes: [inferred.evidenceCode],
      });
    }
  }

  const brandIds = new Set([
    ...[...roleStates.values()].map(({ brandId }) => brandId),
    ...input.fitMemory.map(({ brandId }) => brandId),
  ]);
  const conflicts = [];
  const brands = [...brandIds].sort().map((brandId) => {
    const roles = [...roleStates.values()]
      .filter((role) => role.brandId === brandId)
      .sort((left, right) => BRAND_ROLES.indexOf(left.role) - BRAND_ROLES.indexOf(right.role))
      .map(roleRecord);
    const roleNames = roles.map(({ role }) => role);
    const hasAvoidedConflict = roleNames.includes('avoided') && roleNames.length > 1;
    if (hasAvoidedConflict) {
      conflicts.push({
        brandId,
        code: 'avoided-brand-has-positive-role',
        roles: [...roleNames].sort(),
      });
    }
    const fitMemory = input.fitMemory
      .filter((memory) => memory.brandId === brandId)
      .sort((left, right) => left.itemId.localeCompare(right.itemId))
      .map(minimizedFitMemory);
    const confidence = roles.length
      ? Math.round((roles.reduce((sum, role) => sum + role.confidence, 0) / roles.length) * 100)
      : 0;
    return {
      brandId,
      status: hasAvoidedConflict
        ? 'review-required'
        : roleNames.includes('avoided')
          ? 'excluded'
          : 'eligible',
      confidence,
      roles,
      fitMemory,
      recommendationInfluence: hasAvoidedConflict || roleNames.includes('avoided')
        ? 'none'
        : 'tie-break-only',
    };
  });

  return {
    ok: true,
    result: {
      schemaVersion: BRAND_MEMORY_VERSION,
      profileVersion: input.profileVersion,
      status: conflicts.length ? 'review-required' : 'ready',
      brands,
      conflicts,
      policy: {
        precedence: [
          'styling-quality',
          'wearwyzer-usefulness',
          'editorial-credibility',
          'verified-fit',
          'brand-preference',
        ],
        preferenceMayOverrideQualityOrFit: false,
        preferenceUse: 'tie-break-only-after-equal-quality-and-fit',
        commercialInfluenceAllowed: false,
      },
    },
  };
}

export function serializeBrandPreferenceFitMemory(result) {
  return stableSerialize(result);
}
