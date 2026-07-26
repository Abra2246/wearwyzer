// Fixture-only consent and correction center store.
import {
  createFixturePrivateService,
  PRIVATE_SERVICE_VERSION,
  CONSENT_PURPOSES,
  WARDROBE_SNAPSHOT_MAX_AGE_DAYS,
  validateCorrectionRecord,
  validateFitProfileRecord,
  validateAuditEvent,
} from './private-profile-service-contract.mjs';

export const CONSENT_CENTER_VERSION = 'consent-correction-center-v1';
const STORAGE_KEY = 'wearwyzer.consent-correction-center.v1';
const ACCOUNT_ID = 'fixture-account-01';

function clone(value) {
  return structuredClone(value);
}

function toPlain(state) {
  return {
    schemaVersion: PRIVATE_SERVICE_VERSION,
    accounts: [...state.accounts.values()],
    profiles: [...state.profiles.values()],
    fitProfiles: [...state.fitProfiles.values()],
    wardrobeSnapshots: [...state.wardrobeSnapshots.values()],
    consents: [...state.consents.values()],
    corrections: [...state.corrections.values()],
    deletions: [...state.deletions.values()],
    auditEvents: [...state.auditEvents],
  };
}

function toService(plain) {
  const service = createFixturePrivateService({ nowIso: plain.accounts[0]?.createdAtIso });
  service.state.accounts = new Map(plain.accounts.map((record) => [record.accountId, record]));
  service.state.profiles = new Map(plain.profiles.map((record) => [record.profileId, record]));
  service.state.fitProfiles = new Map(plain.fitProfiles.map((record) => [record.fitProfileId, record]));
  service.state.wardrobeSnapshots = new Map(
    plain.wardrobeSnapshots.map((record) => [record.wardrobeSnapshotId, record]),
  );
  service.state.consents = new Map(plain.consents.map((record) => [record.consentId, record]));
  service.state.corrections = new Map(plain.corrections.map((record) => [record.correctionId, record]));
  service.state.deletions = new Map(plain.deletions.map((record) => [record.deletionId, record]));
  service.state.auditEvents = [...plain.auditEvents];
  return service;
}

function pushAudit(state, { actorAccountId, ownerAccountId, action, targetType, targetId, outcome, atIso }) {
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
  const validation = validateAuditEvent(event);
  if (!validation.valid) throw new Error(`invalid audit event: ${validation.errors.join('; ')}`);
  state.auditEvents.push(event);
  return event;
}

// Seeds demo data the base fixture (personalization slice) doesn't need: consent
// records for every purpose (personalized-images intentionally absent - it is a
// separate later approval per docs/PRIVATE_PROFILE_SERVICE_V1.md), one inferred
// Style DNA signal, and one inferred Fit DNA observation so the correction UI has
// something to override on first load.
function seedConsentCenterDemoData(state, nowIso) {
  const profile = [...state.profiles.values()].find((record) => record.accountId === ACCOUNT_ID);
  const fitProfile = [...state.fitProfiles.values()].find((record) => record.accountId === ACCOUNT_ID);

  profile.signals.push({
    key: 'preferred-fit-silhouette',
    value: 'oversized-outerwear',
    provenance: 'inferred',
    confidence: 0.58,
    updatedAtIso: nowIso,
  });

  fitProfile.observations.push({
    category: 'footwear',
    brand: 'New Balance',
    value: 'half-size-up',
    confidence: 0.64,
    provenance: 'inferred',
    updatedAtIso: nowIso,
  });

  for (const purpose of CONSENT_PURPOSES) {
    if (purpose === 'personalization' || purpose === 'personalized-images') continue;
    const consentId = `fixture-consent-${purpose}-01`;
    state.consents.set(consentId, {
      schemaVersion: PRIVATE_SERVICE_VERSION,
      consentId,
      accountId: ACCOUNT_ID,
      purpose,
      status: 'granted',
      grantedAtIso: nowIso,
      revokedAtIso: null,
    });
  }
}

export function createConsentCenterStore(storage, { now = () => new Date().toISOString() } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('A Web Storage-compatible adapter is required.');
  }

  function freshPlain() {
    const nowIso = now();
    const service = createFixturePrivateService({ nowIso });
    seedConsentCenterDemoData(service.state, nowIso);
    return toPlain(service.state);
  }

  function load() {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return freshPlain();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== PRIVATE_SERVICE_VERSION || !Array.isArray(parsed.accounts)) {
        return freshPlain();
      }
      return parsed;
    } catch {
      return freshPlain();
    }
  }

  function persist(plain) {
    storage.setItem(STORAGE_KEY, JSON.stringify(plain));
    return plain;
  }

  function mutate(fn) {
    const plain = load();
    const service = toService(plain);
    const result = fn(service, now());
    persist(toPlain(service.state));
    return result;
  }

  function requireActiveAccount(service) {
    const account = service.state.accounts.get(ACCOUNT_ID);
    if (!account || account.status !== 'active') {
      return { ok: false, error: 'account-not-active' };
    }
    return null;
  }

  function buildSnapshotView(plain, nowIso) {
    const account = plain.accounts.find((record) => record.accountId === ACCOUNT_ID) ?? null;
    const profile = plain.profiles.find((record) => record.accountId === ACCOUNT_ID) ?? null;
    const fitProfile = plain.fitProfiles.find((record) => record.accountId === ACCOUNT_ID) ?? null;
    const wardrobeSnapshotRecord = plain.wardrobeSnapshots.find((record) => record.accountId === ACCOUNT_ID) ?? null;
    const ageDays = wardrobeSnapshotRecord
      ? (new Date(nowIso).getTime() - new Date(wardrobeSnapshotRecord.createdAtIso).getTime()) / 86_400_000
      : null;
    const wardrobeSnapshot = wardrobeSnapshotRecord
      ? {
        ...clone(wardrobeSnapshotRecord),
        ageDays,
        maxAgeDays: WARDROBE_SNAPSHOT_MAX_AGE_DAYS,
        stale: ageDays > WARDROBE_SNAPSHOT_MAX_AGE_DAYS,
      }
      : null;
    const consents = CONSENT_PURPOSES.map((purpose) => {
      const record = plain.consents.find(
        (entry) => entry.accountId === ACCOUNT_ID && entry.purpose === purpose,
      );
      return record ? clone(record) : { purpose, status: 'not-granted' };
    });
    const deletion = plain.deletions.find((record) => record.accountId === ACCOUNT_ID) ?? null;
    return {
      schemaVersion: CONSENT_CENTER_VERSION,
      account: account ? clone(account) : null,
      profile: profile ? clone(profile) : null,
      fitProfile: fitProfile ? clone(fitProfile) : null,
      wardrobeSnapshot,
      consents,
      corrections: clone(plain.corrections.filter((record) => record.accountId === ACCOUNT_ID)),
      deletion: deletion ? clone(deletion) : null,
    };
  }

  return Object.freeze({
    getSnapshot() {
      const plain = load();
      return buildSnapshotView(plain, now());
    },

    evaluatePersonalization() {
      return mutate((service, nowIso) => {
        const profile = [...service.state.profiles.values()].find((record) => record.accountId === ACCOUNT_ID);
        const snapshot = [...service.state.wardrobeSnapshots.values()].find(
          (record) => record.accountId === ACCOUNT_ID,
        );
        if (!profile || !snapshot) return { ok: false, error: 'private-context-not-found' };
        return service.getPersonalizationReferences({
          actorAccountId: ACCOUNT_ID,
          profileId: profile.profileId,
          wardrobeSnapshotId: snapshot.wardrobeSnapshotId,
          nowIso,
        });
      });
    },

    setConsent(purpose, status) {
      if (!CONSENT_PURPOSES.includes(purpose)) return { ok: false, error: 'unsupported-consent-purpose' };
      if (!['granted', 'revoked'].includes(status)) return { ok: false, error: 'unsupported-consent-status' };
      return mutate((service, nowIso) => {
        const denied = requireActiveAccount(service);
        if (denied) return denied;
        const existing = [...service.state.consents.values()].find(
          (record) => record.accountId === ACCOUNT_ID && record.purpose === purpose,
        );
        if (status === 'revoked') {
          if (!existing || existing.status === 'revoked') {
            return { ok: false, error: 'consent-not-found-or-already-revoked' };
          }
          return service.revokeConsent({ actorAccountId: ACCOUNT_ID, consentId: existing.consentId, nowIso });
        }
        if (existing) {
          existing.status = 'granted';
          existing.grantedAtIso = nowIso;
          existing.revokedAtIso = null;
          pushAudit(service.state, {
            actorAccountId: ACCOUNT_ID,
            ownerAccountId: ACCOUNT_ID,
            action: 'consent-grant',
            targetType: 'consent',
            targetId: existing.consentId,
            outcome: 'allowed',
            atIso: nowIso,
          });
          return { ok: true, consent: clone(existing) };
        }
        const consentId = `fixture-consent-${purpose}-01`;
        const consent = {
          schemaVersion: PRIVATE_SERVICE_VERSION,
          consentId,
          accountId: ACCOUNT_ID,
          purpose,
          status: 'granted',
          grantedAtIso: nowIso,
          revokedAtIso: null,
        };
        service.state.consents.set(consentId, consent);
        pushAudit(service.state, {
          actorAccountId: ACCOUNT_ID,
          ownerAccountId: ACCOUNT_ID,
          action: 'consent-grant',
          targetType: 'consent',
          targetId: consentId,
          outcome: 'allowed',
          atIso: nowIso,
        });
        return { ok: true, consent: clone(consent) };
      });
    },

    applyStyleCorrection({ field, value }) {
      return mutate((service, nowIso) => {
        const denied = requireActiveAccount(service);
        if (denied) return denied;
        const consent = [...service.state.consents.values()].find(
          (record) => record.accountId === ACCOUNT_ID
            && record.purpose === 'style-learning'
            && record.status === 'granted',
        );
        if (!consent) return { ok: false, error: 'style-learning-consent-required' };
        const profile = [...service.state.profiles.values()].find((record) => record.accountId === ACCOUNT_ID);
        if (!profile) return { ok: false, error: 'profile-not-found' };
        const correction = {
          schemaVersion: PRIVATE_SERVICE_VERSION,
          correctionId: `correction-style-${field}-${service.state.corrections.size + 1}`,
          accountId: ACCOUNT_ID,
          targetType: 'profile-signal',
          targetId: profile.profileId,
          field,
          value,
          createdAtIso: nowIso,
        };
        const validation = validateCorrectionRecord(correction);
        if (!validation.valid) return { ok: false, error: validation.errors[0] };
        return service.applyProfileCorrection({ actorAccountId: ACCOUNT_ID, correction, nowIso });
      });
    },

    applyFitCorrection({ category, value }) {
      return mutate((service, nowIso) => {
        const denied = requireActiveAccount(service);
        if (denied) return denied;
        const consent = [...service.state.consents.values()].find(
          (record) => record.accountId === ACCOUNT_ID
            && record.purpose === 'fit-guidance'
            && record.status === 'granted',
        );
        if (!consent) return { ok: false, error: 'fit-guidance-consent-required' };
        const fitProfile = [...service.state.fitProfiles.values()].find(
          (record) => record.accountId === ACCOUNT_ID,
        );
        if (!fitProfile) return { ok: false, error: 'fit-profile-not-found' };
        const correction = {
          schemaVersion: PRIVATE_SERVICE_VERSION,
          correctionId: `correction-fit-${category}-${service.state.corrections.size + 1}`,
          accountId: ACCOUNT_ID,
          targetType: 'fit-observation',
          targetId: fitProfile.fitProfileId,
          field: category,
          value,
          createdAtIso: nowIso,
        };
        const validation = validateCorrectionRecord(correction);
        if (!validation.valid) return { ok: false, error: validation.errors[0] };
        const existingIndex = fitProfile.observations.findIndex(
          (observation) => observation.category === category,
        );
        const explicitObservation = {
          category,
          brand: fitProfile.observations[existingIndex]?.brand ?? null,
          value,
          confidence: 1,
          provenance: 'explicit',
          updatedAtIso: nowIso,
        };
        if (existingIndex >= 0) fitProfile.observations[existingIndex] = explicitObservation;
        else fitProfile.observations.push(explicitObservation);
        fitProfile.updatedAtIso = nowIso;
        const fitValidation = validateFitProfileRecord(fitProfile);
        if (!fitValidation.valid) return { ok: false, error: fitValidation.errors[0] };
        service.state.corrections.set(correction.correctionId, correction);
        pushAudit(service.state, {
          actorAccountId: ACCOUNT_ID,
          ownerAccountId: ACCOUNT_ID,
          action: 'fit-correct',
          targetType: 'fit-observation',
          targetId: fitProfile.fitProfileId,
          outcome: 'completed',
          atIso: nowIso,
        });
        return { ok: true, fitProfile: clone(fitProfile) };
      });
    },

    exportJson() {
      return mutate((service, nowIso) => {
        const result = service.exportAccount({ actorAccountId: ACCOUNT_ID, accountId: ACCOUNT_ID, nowIso });
        return result.ok ? JSON.stringify(result.export, null, 2) : null;
      });
    },

    requestDeletion() {
      return mutate((service, nowIso) => service.requestDeletion({
        actorAccountId: ACCOUNT_ID,
        accountId: ACCOUNT_ID,
        nowIso,
      }));
    },

    completeDeletion() {
      return mutate((service, nowIso) => service.completeDeletion({ accountId: ACCOUNT_ID, nowIso }));
    },

    reset() {
      persist(freshPlain());
      return true;
    },
  });
}
