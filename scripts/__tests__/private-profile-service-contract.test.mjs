import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFixturePrivateService,
  PRIVATE_SERVICE_VERSION,
  validateAccountRecord,
  validateAuditEvent,
  validateConsentRecord,
  validateCorrectionRecord,
  validateDeletionRecord,
  validateFitProfileRecord,
  validateProfileRecord,
  validateWardrobeSnapshot,
} from '../private-profile-service-contract.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from '../__fixtures__/personalization.mjs';

const NOW = '2026-07-25T23:30:00.000Z';

test('fixture records satisfy every closed private-service schema', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  assert.equal(validateAccountRecord(service.state.accounts.get('fixture-account-01')).valid, true);
  assert.equal(validateProfileRecord(service.state.profiles.get(FIXTURE_PROFILE.id)).valid, true);
  assert.equal(validateFitProfileRecord(service.state.fitProfiles.get('fixture-fit-profile-01')).valid, true);
  assert.equal(validateWardrobeSnapshot(
    service.state.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID),
  ).valid, true);
  assert.equal(validateConsentRecord(
    service.state.consents.get('fixture-consent-personalization-01'),
  ).valid, true);
});

test('only the owner may resolve personalization references', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  const denied = service.getPersonalizationReferences({
    actorAccountId: 'another-account',
    profileId: FIXTURE_PROFILE.id,
    wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
    nowIso: NOW,
  });
  assert.deepEqual(denied, { ok: false, error: 'access-denied' });
  assert.equal(service.state.auditEvents.at(-1).outcome, 'denied');
  assert.equal(validateAuditEvent(service.state.auditEvents.at(-1)).valid, true);
});

test('personalization reference response is minimized and contains no private payload', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  const response = service.getPersonalizationReferences({
    actorAccountId: 'fixture-account-01',
    profileId: FIXTURE_PROFILE.id,
    wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
    nowIso: NOW,
  });
  assert.deepEqual(response, {
    ok: true,
    profileId: FIXTURE_PROFILE.id,
    wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
  });
  assert.equal('profile' in response, false);
  assert.equal('wardrobe' in response, false);
});

test('revoked consent fails closed before personalization', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  const revoked = service.revokeConsent({
    actorAccountId: 'fixture-account-01',
    consentId: 'fixture-consent-personalization-01',
    nowIso: NOW,
  });
  assert.equal(revoked.ok, true);
  assert.equal(validateConsentRecord(revoked.consent).valid, true);
  const result = service.getPersonalizationReferences({
    actorAccountId: 'fixture-account-01',
    profileId: FIXTURE_PROFILE.id,
    wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
    nowIso: NOW,
  });
  assert.deepEqual(result, { ok: false, error: 'personalization-consent-required' });
});

test('stale wardrobe snapshots fail closed', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  service.state.wardrobeSnapshots.get(FIXTURE_WARDROBE_SNAPSHOT_ID).createdAtIso =
    '2026-01-01T00:00:00.000Z';
  const result = service.getPersonalizationReferences({
    actorAccountId: 'fixture-account-01',
    profileId: FIXTURE_PROFILE.id,
    wardrobeSnapshotId: FIXTURE_WARDROBE_SNAPSHOT_ID,
    nowIso: NOW,
  });
  assert.deepEqual(result, { ok: false, error: 'stale-wardrobe-snapshot' });
});

test('explicit user correction overrides an inferred profile signal', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  const profile = service.state.profiles.get(FIXTURE_PROFILE.id);
  profile.signals.push({
    key: 'accent-color',
    value: 'red',
    provenance: 'inferred',
    confidence: 0.61,
    updatedAtIso: NOW,
  });
  const correction = {
    schemaVersion: PRIVATE_SERVICE_VERSION,
    correctionId: 'correction-01',
    accountId: 'fixture-account-01',
    targetType: 'profile-signal',
    targetId: FIXTURE_PROFILE.id,
    field: 'accent-color',
    value: 'green',
    createdAtIso: NOW,
  };
  assert.equal(validateCorrectionRecord(correction).valid, true);
  const result = service.applyProfileCorrection({
    actorAccountId: 'fixture-account-01',
    correction,
    nowIso: NOW,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.profile.signals.find((signal) => signal.key === 'accent-color'),
    {
      key: 'accent-color',
      value: 'green',
      provenance: 'explicit',
      confidence: 1,
      updatedAtIso: NOW,
    },
  );
});

test('export is machine-readable, complete for the owner, and excludes audit telemetry', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  const result = service.exportAccount({
    actorAccountId: 'fixture-account-01',
    accountId: 'fixture-account-01',
    nowIso: NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.export.schemaVersion, 'private-profile-export-v1');
  assert.equal(result.export.profiles.length, 1);
  assert.equal(result.export.wardrobeSnapshots[0].items.length, 6);
  assert.equal('auditEvents' in result.export, false);
  assert.doesNotThrow(() => JSON.stringify(result.export));
});

test('deletion is explicit, stateful, and removes dependent private records', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  const requested = service.requestDeletion({
    actorAccountId: 'fixture-account-01',
    accountId: 'fixture-account-01',
    nowIso: NOW,
  });
  assert.equal(requested.deletion.state, 'pending');
  assert.equal(validateDeletionRecord(requested.deletion).valid, true);
  assert.equal(service.state.accounts.get('fixture-account-01').status, 'deleting');

  const completed = service.completeDeletion({
    accountId: 'fixture-account-01',
    nowIso: '2026-07-25T23:31:00.000Z',
  });
  assert.equal(completed.deletion.state, 'completed');
  assert.equal(validateDeletionRecord(completed.deletion).valid, true);
  assert.equal(service.state.accounts.get('fixture-account-01').status, 'deleted');
  assert.equal(service.state.profiles.size, 0);
  assert.equal(service.state.fitProfiles.size, 0);
  assert.equal(service.state.wardrobeSnapshots.size, 0);
  assert.equal(service.state.consents.size, 0);
  assert.equal(service.state.corrections.size, 0);
});

test('closed schemas reject over-broad private fields', () => {
  const service = createFixturePrivateService({ nowIso: NOW });
  const leaked = {
    ...service.state.accounts.get('fixture-account-01'),
    rawMeasurements: { chest: 40 },
  };
  const result = validateAccountRecord(leaked);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unknown key "rawMeasurements"/);
});
