import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from './__fixtures__/personalization.mjs';

export const PRIVATE_SERVICE_VERSION = 'private-profile-service-v1';
export const PRIVATE_EXPORT_VERSION = 'private-profile-export-v1';
export const CONSENT_PURPOSES = Object.freeze([
  'personalization',
  'style-learning',
  'fit-guidance',
  'wardrobe-photos',
  'personalized-images',
]);
export const SIGNAL_PROVENANCE = Object.freeze(['explicit', 'inferred']);
export const DELETION_STATES = Object.freeze(['pending', 'completed', 'failed']);
export const WARDROBE_SNAPSHOT_MAX_AGE_DAYS = 30;

const ACCOUNT_KEYS = new Set([
  'schemaVersion',
  'accountId',
  'authSubject',
  'status',
  'createdAtIso',
  'updatedAtIso',
]);
const PROFILE_KEYS = new Set([
  'schemaVersion',
  'profileId',
  'accountId',
  'audience',
  'commonOccasions',
  'signals',
  'createdAtIso',
  'updatedAtIso',
]);
const SIGNAL_KEYS = new Set(['key', 'value', 'provenance', 'confidence', 'updatedAtIso']);
const FIT_KEYS = new Set([
  'schemaVersion',
  'fitProfileId',
  'accountId',
  'categorySizes',
  'fitPreferences',
  'observations',
  'updatedAtIso',
]);
const FIT_OBSERVATION_KEYS = new Set([
  'category',
  'brand',
  'value',
  'confidence',
  'provenance',
  'updatedAtIso',
]);
const SNAPSHOT_KEYS = new Set([
  'schemaVersion',
  'wardrobeSnapshotId',
  'accountId',
  'items',
  'createdAtIso',
]);
const WARDROBE_ITEM_KEYS = new Set([
  'wardrobeItemId',
  'productId',
  'matchState',
  'matchConfidence',
  'size',
  'fitNote',
  'createdAtIso',
]);
const CONSENT_KEYS = new Set([
  'schemaVersion',
  'consentId',
  'accountId',
  'purpose',
  'status',
  'grantedAtIso',
  'revokedAtIso',
]);
const CORRECTION_KEYS = new Set([
  'schemaVersion',
  'correctionId',
  'accountId',
  'targetType',
  'targetId',
  'field',
  'value',
  'createdAtIso',
]);
const DELETION_KEYS = new Set([
  'schemaVersion',
  'deletionId',
  'accountId',
  'state',
  'requestedAtIso',
  'completedAtIso',
  'failureCode',
]);
const AUDIT_KEYS = new Set([
  'schemaVersion',
  'eventId',
  'accountId',
  'actorAccountId',
  'action',
  'targetType',
  'targetId',
  'outcome',
  'createdAtIso',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIso(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function requiredString(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${path}: required non-empty string`);
}

function unknownKeys(value, allowed, path, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}: unknown key "${key}"`);
  }
}

function baseRecord(record, allowed, idKey, path, errors) {
  if (!isObject(record)) {
    errors.push(`${path}: required object`);
    return false;
  }
  unknownKeys(record, allowed, path, errors);
  if (record.schemaVersion !== PRIVATE_SERVICE_VERSION) {
    errors.push(`${path}.schemaVersion: expected ${PRIVATE_SERVICE_VERSION}`);
  }
  requiredString(record[idKey], `${path}.${idKey}`, errors);
  requiredString(record.accountId, `${path}.accountId`, errors);
  return true;
}

export function validateAccountRecord(record) {
  const errors = [];
  if (!baseRecord(record, ACCOUNT_KEYS, 'accountId', 'account', errors)) {
    return { valid: false, errors };
  }
  requiredString(record.authSubject, 'account.authSubject', errors);
  if (!['active', 'deleting', 'deleted'].includes(record.status)) {
    errors.push('account.status: expected active, deleting, or deleted');
  }
  if (!isIso(record.createdAtIso)) errors.push('account.createdAtIso: expected ISO timestamp');
  if (!isIso(record.updatedAtIso)) errors.push('account.updatedAtIso: expected ISO timestamp');
  return { valid: errors.length === 0, errors };
}

export function validateProfileRecord(record) {
  const errors = [];
  if (!baseRecord(record, PROFILE_KEYS, 'profileId', 'profile', errors)) {
    return { valid: false, errors };
  }
  requiredString(record.audience, 'profile.audience', errors);
  if (!Array.isArray(record.commonOccasions)) {
    errors.push('profile.commonOccasions: expected array');
  }
  if (!Array.isArray(record.signals)) {
    errors.push('profile.signals: expected array');
  } else {
    record.signals.forEach((signal, index) => {
      unknownKeys(signal, SIGNAL_KEYS, `profile.signals[${index}]`, errors);
      requiredString(signal?.key, `profile.signals[${index}].key`, errors);
      if (!SIGNAL_PROVENANCE.includes(signal?.provenance)) {
        errors.push(`profile.signals[${index}].provenance: unsupported`);
      }
      if (typeof signal?.confidence !== 'number' || signal.confidence < 0 || signal.confidence > 1) {
        errors.push(`profile.signals[${index}].confidence: expected number between 0 and 1`);
      }
      if (!isIso(signal?.updatedAtIso)) {
        errors.push(`profile.signals[${index}].updatedAtIso: expected ISO timestamp`);
      }
    });
  }
  if (!isIso(record.createdAtIso)) errors.push('profile.createdAtIso: expected ISO timestamp');
  if (!isIso(record.updatedAtIso)) errors.push('profile.updatedAtIso: expected ISO timestamp');
  return { valid: errors.length === 0, errors };
}

export function validateFitProfileRecord(record) {
  const errors = [];
  if (!baseRecord(record, FIT_KEYS, 'fitProfileId', 'fitProfile', errors)) {
    return { valid: false, errors };
  }
  if (!isObject(record.categorySizes)) errors.push('fitProfile.categorySizes: expected object');
  if (!isObject(record.fitPreferences)) errors.push('fitProfile.fitPreferences: expected object');
  if (!Array.isArray(record.observations)) {
    errors.push('fitProfile.observations: expected array');
  } else {
    record.observations.forEach((observation, index) => {
      unknownKeys(observation, FIT_OBSERVATION_KEYS, `fitProfile.observations[${index}]`, errors);
      requiredString(observation?.category, `fitProfile.observations[${index}].category`, errors);
      if (!SIGNAL_PROVENANCE.includes(observation?.provenance)) {
        errors.push(`fitProfile.observations[${index}].provenance: unsupported`);
      }
    });
  }
  if (!isIso(record.updatedAtIso)) errors.push('fitProfile.updatedAtIso: expected ISO timestamp');
  return { valid: errors.length === 0, errors };
}

export function validateWardrobeSnapshot(record) {
  const errors = [];
  if (!baseRecord(record, SNAPSHOT_KEYS, 'wardrobeSnapshotId', 'wardrobeSnapshot', errors)) {
    return { valid: false, errors };
  }
  if (!Array.isArray(record.items)) {
    errors.push('wardrobeSnapshot.items: expected array');
  } else {
    record.items.forEach((item, index) => {
      unknownKeys(item, WARDROBE_ITEM_KEYS, `wardrobeSnapshot.items[${index}]`, errors);
      requiredString(item?.wardrobeItemId, `wardrobeSnapshot.items[${index}].wardrobeItemId`, errors);
      requiredString(item?.productId, `wardrobeSnapshot.items[${index}].productId`, errors);
      if (!['exact', 'similar', 'unknown'].includes(item?.matchState)) {
        errors.push(`wardrobeSnapshot.items[${index}].matchState: unsupported`);
      }
      if (
        typeof item?.matchConfidence !== 'number'
        || item.matchConfidence < 0
        || item.matchConfidence > 1
      ) {
        errors.push(`wardrobeSnapshot.items[${index}].matchConfidence: expected 0..1`);
      }
      if (!isIso(item?.createdAtIso)) {
        errors.push(`wardrobeSnapshot.items[${index}].createdAtIso: expected ISO timestamp`);
      }
    });
  }
  if (!isIso(record.createdAtIso)) errors.push('wardrobeSnapshot.createdAtIso: expected ISO timestamp');
  return { valid: errors.length === 0, errors };
}

export function validateConsentRecord(record) {
  const errors = [];
  if (!baseRecord(record, CONSENT_KEYS, 'consentId', 'consent', errors)) {
    return { valid: false, errors };
  }
  if (!CONSENT_PURPOSES.includes(record.purpose)) errors.push('consent.purpose: unsupported');
  if (!['granted', 'revoked'].includes(record.status)) errors.push('consent.status: unsupported');
  if (!isIso(record.grantedAtIso)) errors.push('consent.grantedAtIso: expected ISO timestamp');
  if (record.status === 'revoked' && !isIso(record.revokedAtIso)) {
    errors.push('consent.revokedAtIso: revoked consent requires timestamp');
  }
  if (record.status === 'granted' && record.revokedAtIso !== null) {
    errors.push('consent.revokedAtIso: granted consent requires null');
  }
  return { valid: errors.length === 0, errors };
}

export function validateCorrectionRecord(record) {
  const errors = [];
  if (!baseRecord(record, CORRECTION_KEYS, 'correctionId', 'correction', errors)) {
    return { valid: false, errors };
  }
  if (!['profile-signal', 'fit-observation', 'wardrobe-item'].includes(record.targetType)) {
    errors.push('correction.targetType: unsupported');
  }
  requiredString(record.targetId, 'correction.targetId', errors);
  requiredString(record.field, 'correction.field', errors);
  if (!isIso(record.createdAtIso)) errors.push('correction.createdAtIso: expected ISO timestamp');
  return { valid: errors.length === 0, errors };
}

export function validateDeletionRecord(record) {
  const errors = [];
  if (!baseRecord(record, DELETION_KEYS, 'deletionId', 'deletion', errors)) {
    return { valid: false, errors };
  }
  if (!DELETION_STATES.includes(record.state)) errors.push('deletion.state: unsupported');
  if (!isIso(record.requestedAtIso)) errors.push('deletion.requestedAtIso: expected ISO timestamp');
  if (record.state === 'completed' && !isIso(record.completedAtIso)) {
    errors.push('deletion.completedAtIso: completed deletion requires timestamp');
  }
  if (record.state === 'failed') requiredString(record.failureCode, 'deletion.failureCode', errors);
  return { valid: errors.length === 0, errors };
}

export function validateAuditEvent(record) {
  const errors = [];
  if (!baseRecord(record, AUDIT_KEYS, 'eventId', 'auditEvent', errors)) {
    return { valid: false, errors };
  }
  requiredString(record.actorAccountId, 'auditEvent.actorAccountId', errors);
  requiredString(record.action, 'auditEvent.action', errors);
  requiredString(record.targetType, 'auditEvent.targetType', errors);
  requiredString(record.targetId, 'auditEvent.targetId', errors);
  if (!['allowed', 'denied', 'completed', 'failed'].includes(record.outcome)) {
    errors.push('auditEvent.outcome: unsupported');
  }
  if (!isIso(record.createdAtIso)) errors.push('auditEvent.createdAtIso: expected ISO timestamp');
  return { valid: errors.length === 0, errors };
}

function clone(value) {
  return structuredClone(value);
}

function daysOld(iso, nowIso) {
  return (new Date(nowIso).getTime() - new Date(iso).getTime()) / 86_400_000;
}

export function createFixturePrivateService({ nowIso = '2026-07-25T23:30:00.000Z' } = {}) {
  const accountId = 'fixture-account-01';
  const profileId = FIXTURE_PROFILE.id;
  const account = {
    schemaVersion: PRIVATE_SERVICE_VERSION,
    accountId,
    authSubject: 'fixture-auth-subject-01',
    status: 'active',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  const profile = {
    schemaVersion: PRIVATE_SERVICE_VERSION,
    profileId,
    accountId,
    audience: FIXTURE_PROFILE.audience,
    commonOccasions: [...FIXTURE_PROFILE.commonOccasions],
    signals: [
      {
        key: 'preferred-colors',
        value: [...FIXTURE_PROFILE.preferredColors],
        provenance: 'explicit',
        confidence: 1,
        updatedAtIso: nowIso,
      },
      {
        key: 'preferred-aesthetics',
        value: [...FIXTURE_PROFILE.preferredAesthetics],
        provenance: 'explicit',
        confidence: 1,
        updatedAtIso: nowIso,
      },
    ],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  const fitProfile = {
    schemaVersion: PRIVATE_SERVICE_VERSION,
    fitProfileId: 'fixture-fit-profile-01',
    accountId,
    categorySizes: { footwear: 'US 10', tops: 'M', pants: '32x30' },
    fitPreferences: clone(FIXTURE_PROFILE.fitPreferences),
    observations: [],
    updatedAtIso: nowIso,
  };
  const wardrobeSnapshot = {
    schemaVersion: PRIVATE_SERVICE_VERSION,
    wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
    accountId,
    items: FIXTURE_WARDROBE.map((item) => ({
      wardrobeItemId: item.id,
      productId: item.productId,
      matchState: 'exact',
      matchConfidence: 1,
      size: null,
      fitNote: null,
      createdAtIso: nowIso,
    })),
    createdAtIso: nowIso,
  };
  const personalizationConsent = {
    schemaVersion: PRIVATE_SERVICE_VERSION,
    consentId: 'fixture-consent-personalization-01',
    accountId,
    purpose: 'personalization',
    status: 'granted',
    grantedAtIso: nowIso,
    revokedAtIso: null,
  };

  const state = {
    accounts: new Map([[accountId, account]]),
    profiles: new Map([[profileId, profile]]),
    fitProfiles: new Map([[fitProfile.fitProfileId, fitProfile]]),
    wardrobeSnapshots: new Map([[wardrobeSnapshot.wardrobeSnapshotId, wardrobeSnapshot]]),
    consents: new Map([[personalizationConsent.consentId, personalizationConsent]]),
    corrections: new Map(),
    deletions: new Map(),
    auditEvents: [],
  };

  function audit(actorAccountId, ownerAccountId, action, targetType, targetId, outcome, atIso) {
    const event = {
      schemaVersion: PRIVATE_SERVICE_VERSION,
      eventId: `audit-${state.auditEvents.length + 1}`,
      accountId: ownerAccountId,
      actorAccountId,
      action,
      targetType,
      targetId,
      outcome,
      createdAtIso: atIso,
    };
    state.auditEvents.push(event);
    return event;
  }

  function authorize(actorAccountId, ownerAccountId, action, targetType, targetId, atIso) {
    const allowed = actorAccountId === ownerAccountId
      && state.accounts.get(ownerAccountId)?.status === 'active';
    audit(actorAccountId, ownerAccountId, action, targetType, targetId, allowed ? 'allowed' : 'denied', atIso);
    return allowed;
  }

  return {
    state,
    getPersonalizationReferences({
      actorAccountId,
      profileId: requestedProfileId,
      wardrobeSnapshotId,
      nowIso: requestedAtIso = nowIso,
    }) {
      const requestedProfile = state.profiles.get(requestedProfileId);
      const requestedSnapshot = state.wardrobeSnapshots.get(wardrobeSnapshotId);
      const ownerAccountId = requestedProfile?.accountId ?? requestedSnapshot?.accountId;
      if (!ownerAccountId || !authorize(
        actorAccountId,
        ownerAccountId,
        'personalization-reference-read',
        'personalization-context',
        requestedProfileId,
        requestedAtIso,
      )) return { ok: false, error: 'access-denied' };
      const consent = [...state.consents.values()].find((entry) =>
        entry.accountId === ownerAccountId
        && entry.purpose === 'personalization'
        && entry.status === 'granted'
      );
      if (!consent) return { ok: false, error: 'personalization-consent-required' };
      if (!requestedProfile || !requestedSnapshot || requestedSnapshot.accountId !== ownerAccountId) {
        return { ok: false, error: 'private-context-not-found' };
      }
      if (
        !isIso(requestedSnapshot.createdAtIso)
        || daysOld(requestedSnapshot.createdAtIso, requestedAtIso) > WARDROBE_SNAPSHOT_MAX_AGE_DAYS
      ) return { ok: false, error: 'stale-wardrobe-snapshot' };
      return {
        ok: true,
        profileId: requestedProfile.profileId,
        wardrobeSnapshotId: requestedSnapshot.wardrobeSnapshotId,
      };
    },
    revokeConsent({ actorAccountId, consentId, nowIso: requestedAtIso = nowIso }) {
      const consent = state.consents.get(consentId);
      if (!consent || !authorize(
        actorAccountId,
        consent?.accountId,
        'consent-revoke',
        'consent',
        consentId,
        requestedAtIso,
      )) return { ok: false, error: 'access-denied' };
      consent.status = 'revoked';
      consent.revokedAtIso = requestedAtIso;
      return { ok: true, consent: clone(consent) };
    },
    applyProfileCorrection({ actorAccountId, correction, nowIso: requestedAtIso = nowIso }) {
      const validation = validateCorrectionRecord(correction);
      if (!validation.valid) return { ok: false, error: validation.errors[0] };
      if (!authorize(
        actorAccountId,
        correction.accountId,
        'profile-correct',
        correction.targetType,
        correction.targetId,
        requestedAtIso,
      )) return { ok: false, error: 'access-denied' };
      const targetProfile = state.profiles.get(correction.targetId);
      if (!targetProfile || targetProfile.accountId !== correction.accountId) {
        return { ok: false, error: 'profile-not-found' };
      }
      const existingIndex = targetProfile.signals.findIndex((signal) => signal.key === correction.field);
      const explicitSignal = {
        key: correction.field,
        value: clone(correction.value),
        provenance: 'explicit',
        confidence: 1,
        updatedAtIso: correction.createdAtIso,
      };
      if (existingIndex >= 0) targetProfile.signals[existingIndex] = explicitSignal;
      else targetProfile.signals.push(explicitSignal);
      targetProfile.updatedAtIso = correction.createdAtIso;
      state.corrections.set(correction.correctionId, clone(correction));
      return { ok: true, profile: clone(targetProfile) };
    },
    exportAccount({ actorAccountId, accountId: ownerAccountId, nowIso: requestedAtIso = nowIso }) {
      if (!authorize(
        actorAccountId,
        ownerAccountId,
        'account-export',
        'account',
        ownerAccountId,
        requestedAtIso,
      )) return { ok: false, error: 'access-denied' };
      return {
        ok: true,
        export: {
          schemaVersion: PRIVATE_EXPORT_VERSION,
          account: clone(state.accounts.get(ownerAccountId)),
          profiles: clone([...state.profiles.values()].filter((entry) => entry.accountId === ownerAccountId)),
          fitProfiles: clone([...state.fitProfiles.values()].filter((entry) => entry.accountId === ownerAccountId)),
          wardrobeSnapshots: clone([...state.wardrobeSnapshots.values()].filter((entry) => entry.accountId === ownerAccountId)),
          consents: clone([...state.consents.values()].filter((entry) => entry.accountId === ownerAccountId)),
          corrections: clone([...state.corrections.values()].filter((entry) => entry.accountId === ownerAccountId)),
          exportedAtIso: requestedAtIso,
        },
      };
    },
    requestDeletion({ actorAccountId, accountId: ownerAccountId, nowIso: requestedAtIso = nowIso }) {
      if (!authorize(
        actorAccountId,
        ownerAccountId,
        'account-delete-request',
        'account',
        ownerAccountId,
        requestedAtIso,
      )) return { ok: false, error: 'access-denied' };
      const accountRecord = state.accounts.get(ownerAccountId);
      accountRecord.status = 'deleting';
      accountRecord.updatedAtIso = requestedAtIso;
      const deletion = {
        schemaVersion: PRIVATE_SERVICE_VERSION,
        deletionId: `deletion-${ownerAccountId}`,
        accountId: ownerAccountId,
        state: 'pending',
        requestedAtIso,
        completedAtIso: null,
        failureCode: null,
      };
      state.deletions.set(deletion.deletionId, deletion);
      return { ok: true, deletion: clone(deletion) };
    },
    completeDeletion({ accountId: ownerAccountId, nowIso: requestedAtIso = nowIso }) {
      const deletion = state.deletions.get(`deletion-${ownerAccountId}`);
      if (!deletion || deletion.state !== 'pending') {
        return { ok: false, error: 'pending-deletion-not-found' };
      }
      for (const [key, value] of state.profiles) if (value.accountId === ownerAccountId) state.profiles.delete(key);
      for (const [key, value] of state.fitProfiles) if (value.accountId === ownerAccountId) state.fitProfiles.delete(key);
      for (const [key, value] of state.wardrobeSnapshots) {
        if (value.accountId === ownerAccountId) state.wardrobeSnapshots.delete(key);
      }
      for (const [key, value] of state.consents) if (value.accountId === ownerAccountId) state.consents.delete(key);
      for (const [key, value] of state.corrections) if (value.accountId === ownerAccountId) state.corrections.delete(key);
      const accountRecord = state.accounts.get(ownerAccountId);
      accountRecord.authSubject = 'deleted';
      accountRecord.status = 'deleted';
      accountRecord.updatedAtIso = requestedAtIso;
      deletion.state = 'completed';
      deletion.completedAtIso = requestedAtIso;
      audit(ownerAccountId, ownerAccountId, 'account-delete', 'account', ownerAccountId, 'completed', requestedAtIso);
      return { ok: true, deletion: clone(deletion) };
    },
  };
}
