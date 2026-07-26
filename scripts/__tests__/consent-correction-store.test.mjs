import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsentCenterStore, CONSENT_CENTER_VERSION } from '../consent-correction-store.mjs';
import { CONSENT_PURPOSES } from '../private-profile-service-contract.mjs';

const NOW = '2026-07-25T23:30:00.000Z';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function makeStore(nowIso = NOW) {
  return createConsentCenterStore(memoryStorage(), { now: () => nowIso });
}

test('store rejects adapters that cannot honor persistence semantics', () => {
  assert.throws(() => createConsentCenterStore({}), /Web Storage-compatible/);
});

test('initial snapshot separates every consent purpose and seeds one inferred signal per DNA type', () => {
  const store = makeStore();
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.schemaVersion, CONSENT_CENTER_VERSION);
  assert.deepEqual(snapshot.consents.map((c) => c.purpose), CONSENT_PURPOSES);
  assert.equal(
    snapshot.consents.find((c) => c.purpose === 'personalized-images').status,
    'not-granted',
  );
  for (const purpose of ['personalization', 'style-learning', 'fit-guidance', 'wardrobe-photos']) {
    assert.equal(snapshot.consents.find((c) => c.purpose === purpose).status, 'granted');
  }
  const inferredStyleSignal = snapshot.profile.signals.find((s) => s.provenance === 'inferred');
  assert.ok(inferredStyleSignal);
  assert.ok(inferredStyleSignal.confidence < 1);
  const inferredFitObservation = snapshot.fitProfile.observations.find((o) => o.provenance === 'inferred');
  assert.ok(inferredFitObservation);
  assert.ok(inferredFitObservation.confidence < 1);
});

test('wardrobe snapshot freshness is visible and flags staleness past the 30-day boundary', () => {
  const fresh = makeStore().getSnapshot();
  assert.equal(fresh.wardrobeSnapshot.ageDays, 0);
  assert.equal(fresh.wardrobeSnapshot.stale, false);

  const storage = memoryStorage();
  const seedStore = createConsentCenterStore(storage, { now: () => NOW });
  // getSnapshot() alone never persists; force the seeded fixture to be written
  // so a later store instance reads the same wardrobeSnapshot.createdAtIso.
  seedStore.evaluatePersonalization();

  const later = new Date(new Date(NOW).getTime() + 31 * 86_400_000).toISOString();
  const staleStore = createConsentCenterStore(storage, { now: () => later });
  const staleSnapshot = staleStore.getSnapshot();
  assert.ok(staleSnapshot.wardrobeSnapshot.ageDays > 30);
  assert.equal(staleSnapshot.wardrobeSnapshot.stale, true);
});

test('revoking personalization consent fails closed on the very next dependent evaluation', () => {
  const store = makeStore();
  const before = store.evaluatePersonalization();
  assert.equal(before.ok, true);
  assert.deepEqual(Object.keys(before).sort(), ['ok', 'profileId', 'wardrobeSnapshotId'].sort());

  const revoked = store.setConsent('personalization', 'revoked');
  assert.equal(revoked.ok, true);
  assert.equal(revoked.consent.status, 'revoked');

  const after = store.evaluatePersonalization();
  assert.deepEqual(after, { ok: false, error: 'personalization-consent-required' });
});

test('minimized personalization reference never contains the full profile or wardrobe', () => {
  const store = makeStore();
  const result = store.evaluatePersonalization();
  assert.equal('profile' in result, false);
  assert.equal('wardrobe' in result, false);
  assert.equal('signals' in result, false);
});

test('an explicit style correction visibly outranks the inferred Style DNA signal', () => {
  const store = makeStore();
  const before = store.getSnapshot().profile.signals.find((s) => s.key === 'preferred-fit-silhouette');
  assert.equal(before.provenance, 'inferred');

  const result = store.applyStyleCorrection({ field: 'preferred-fit-silhouette', value: 'tailored-outerwear' });
  assert.equal(result.ok, true);
  const corrected = result.profile.signals.find((s) => s.key === 'preferred-fit-silhouette');
  assert.deepEqual(corrected, {
    key: 'preferred-fit-silhouette',
    value: 'tailored-outerwear',
    provenance: 'explicit',
    confidence: 1,
    updatedAtIso: NOW,
  });

  const after = store.getSnapshot();
  assert.equal(
    after.profile.signals.find((s) => s.key === 'preferred-fit-silhouette').provenance,
    'explicit',
  );
  assert.equal(after.corrections.length, 1);
  assert.equal(after.corrections[0].targetType, 'profile-signal');
});

test('style correction fails closed when style-learning consent is revoked', () => {
  const store = makeStore();
  store.setConsent('style-learning', 'revoked');
  const result = store.applyStyleCorrection({ field: 'preferred-fit-silhouette', value: 'anything' });
  assert.deepEqual(result, { ok: false, error: 'style-learning-consent-required' });
});

test('an explicit fit correction visibly outranks the inferred Fit DNA observation', () => {
  const store = makeStore();
  const before = store.getSnapshot().fitProfile.observations.find((o) => o.category === 'footwear');
  assert.equal(before.provenance, 'inferred');

  const result = store.applyFitCorrection({ category: 'footwear', value: 'true-to-size' });
  assert.equal(result.ok, true);
  const corrected = result.fitProfile.observations.find((o) => o.category === 'footwear');
  assert.equal(corrected.provenance, 'explicit');
  assert.equal(corrected.confidence, 1);
  assert.equal(corrected.value, 'true-to-size');
  assert.equal(corrected.brand, 'New Balance');

  const after = store.getSnapshot();
  assert.equal(
    after.fitProfile.observations.find((o) => o.category === 'footwear').provenance,
    'explicit',
  );
  assert.equal(after.corrections.some((c) => c.targetType === 'fit-observation'), true);
});

test('fit correction fails closed when fit-guidance consent is revoked', () => {
  const store = makeStore();
  store.setConsent('fit-guidance', 'revoked');
  const result = store.applyFitCorrection({ category: 'footwear', value: 'anything' });
  assert.deepEqual(result, { ok: false, error: 'fit-guidance-consent-required' });
});

test('revoked consent can be re-granted independently per purpose', () => {
  const store = makeStore();
  store.setConsent('wardrobe-photos', 'revoked');
  assert.equal(
    store.getSnapshot().consents.find((c) => c.purpose === 'wardrobe-photos').status,
    'revoked',
  );
  const regranted = store.setConsent('wardrobe-photos', 'granted');
  assert.equal(regranted.ok, true);
  assert.equal(regranted.consent.status, 'granted');
  assert.equal(
    store.getSnapshot().consents.find((c) => c.purpose === 'style-learning').status,
    'granted',
  );
});

test('export is a versioned, machine-readable bundle complete for the fixture record and excludes audit telemetry', () => {
  const store = makeStore();
  store.applyStyleCorrection({ field: 'preferred-fit-silhouette', value: 'tailored-outerwear' });
  const exported = JSON.parse(store.exportJson());
  assert.equal(exported.schemaVersion, 'private-profile-export-v1');
  assert.equal(exported.account.accountId, 'fixture-account-01');
  assert.equal(exported.profiles.length, 1);
  assert.equal(exported.fitProfiles.length, 1);
  assert.equal(exported.wardrobeSnapshots[0].items.length, 6);
  assert.equal(exported.corrections.length, 1);
  assert.equal('auditEvents' in exported, false);
  assert.doesNotThrow(() => JSON.stringify(exported));
});

test('deletion is pending, then completed, and removes every dependent fixture store', () => {
  const store = makeStore();
  const requested = store.requestDeletion();
  assert.equal(requested.ok, true);
  assert.equal(requested.deletion.state, 'pending');
  assert.equal(store.getSnapshot().account.status, 'deleting');

  const completed = store.completeDeletion();
  assert.equal(completed.ok, true);
  assert.equal(completed.deletion.state, 'completed');

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.account.status, 'deleted');
  assert.equal(snapshot.profile, null);
  assert.equal(snapshot.fitProfile, null);
  assert.equal(snapshot.wardrobeSnapshot, null);
  assert.equal(snapshot.corrections.length, 0);
  for (const consent of snapshot.consents) assert.equal(consent.status, 'not-granted');
});

test('a deleted account fails closed on every further mutation', () => {
  const store = makeStore();
  store.requestDeletion();
  store.completeDeletion();
  assert.deepEqual(
    store.setConsent('wardrobe-photos', 'revoked'),
    { ok: false, error: 'account-not-active' },
  );
  assert.deepEqual(
    store.applyStyleCorrection({ field: 'preferred-fit-silhouette', value: 'x' }),
    { ok: false, error: 'account-not-active' },
  );
});

test('reset restores deterministic fixture data after corrections, revocations, and deletion', () => {
  const store = makeStore();
  store.setConsent('personalization', 'revoked');
  store.applyStyleCorrection({ field: 'preferred-fit-silhouette', value: 'tailored-outerwear' });
  store.requestDeletion();
  store.completeDeletion();

  store.reset();
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.account.status, 'active');
  assert.equal(snapshot.corrections.length, 0);
  assert.equal(
    snapshot.profile.signals.find((s) => s.key === 'preferred-fit-silhouette').provenance,
    'inferred',
  );
  assert.equal(
    snapshot.consents.find((c) => c.purpose === 'personalization').status,
    'granted',
  );
});

test('state persists across independent store instances sharing the same storage adapter', () => {
  const storage = memoryStorage();
  const first = createConsentCenterStore(storage, { now: () => NOW });
  first.setConsent('personalization', 'revoked');

  const second = createConsentCenterStore(storage, { now: () => NOW });
  assert.equal(
    second.getSnapshot().consents.find((c) => c.purpose === 'personalization').status,
    'revoked',
  );
});

test('a corrupted or foreign storage payload falls back to fresh deterministic fixture data', () => {
  const storage = memoryStorage();
  storage.setItem('wearwyzer.consent-correction-center.v1', 'not-json');
  const store = createConsentCenterStore(storage, { now: () => NOW });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.account.status, 'active');
  assert.equal(snapshot.profile.accountId, 'fixture-account-01');
});
