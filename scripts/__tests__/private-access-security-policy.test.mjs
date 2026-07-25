import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizePrivateAction,
  evaluateDeletionCompletion,
  EXTENSION_MESSAGE_VERSION,
  findSensitiveKeys,
  PRIVATE_ACCESS_POLICY_VERSION,
  validateExtensionMessage,
  validatePrivateSession,
} from '../private-access-security-policy.mjs';

const NOW = '2026-07-25T23:45:00.000Z';

function session(overrides = {}) {
  return {
    schemaVersion: PRIVATE_ACCESS_POLICY_VERSION,
    sessionId: 'fixture-session-01',
    accountId: 'fixture-account-01',
    authSubject: 'fixture-auth-subject-01',
    client: 'web',
    scopes: ['profile:read', 'profile:write', 'wardrobe:read'],
    issuedAtIso: '2026-07-25T23:30:00.000Z',
    expiresAtIso: '2026-07-26T00:00:00.000Z',
    csrfVerified: true,
    ...overrides,
  };
}

function extensionMessage(overrides = {}) {
  return {
    schemaVersion: EXTENSION_MESSAGE_VERSION,
    messageId: 'fixture-message-01',
    type: 'active-product-evaluation',
    origin: 'https://www.adidas.com',
    productId: 'adidas-samba-og-b75806',
    matchState: 'exact',
    matchConfidence: 1,
    createdAtIso: NOW,
    ...overrides,
  };
}

test('valid short-lived same-account session is accepted', () => {
  assert.deepEqual(validatePrivateSession(session(), { nowIso: NOW }), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(authorizePrivateAction({
    session: session(),
    ownerAccountId: 'fixture-account-01',
    requiredScope: 'profile:read',
    nowIso: NOW,
  }), { allowed: true, reason: null });
});

test('expired and overlong sessions fail closed', () => {
  const expired = validatePrivateSession(session({
    issuedAtIso: '2026-07-25T22:00:00.000Z',
    expiresAtIso: '2026-07-25T23:00:00.000Z',
  }), { nowIso: NOW });
  assert.equal(expired.valid, false);
  assert.match(expired.errors.join('\n'), /expired/);

  const overlong = validatePrivateSession(session({
    issuedAtIso: '2026-07-25T23:00:00.000Z',
    expiresAtIso: '2026-07-26T01:00:00.000Z',
  }), { nowIso: NOW });
  assert.equal(overlong.valid, false);
  assert.match(overlong.errors.join('\n'), /lifetime/);
});

test('cross-account access and missing scopes are denied', () => {
  assert.equal(authorizePrivateAction({
    session: session(),
    ownerAccountId: 'another-account',
    requiredScope: 'profile:read',
    nowIso: NOW,
  }).reason, 'cross-account-access-denied');

  assert.equal(authorizePrivateAction({
    session: session(),
    ownerAccountId: 'fixture-account-01',
    requiredScope: 'account:export',
    nowIso: NOW,
  }).reason, 'required-scope-missing');
});

test('web mutations require CSRF verification', () => {
  const result = authorizePrivateAction({
    session: session({ csrfVerified: false }),
    ownerAccountId: 'fixture-account-01',
    requiredScope: 'profile:write',
    mutation: true,
    nowIso: NOW,
  });
  assert.deepEqual(result, { allowed: false, reason: 'csrf-verification-required' });
});

test('extension accepts only fresh minimal messages from allowlisted HTTPS origins', () => {
  assert.deepEqual(validateExtensionMessage(extensionMessage(), {
    allowedOrigins: ['https://www.adidas.com'],
    nowIso: NOW,
  }), { valid: true, errors: [] });
});

test('extension rejects hostile origins, stale messages, and over-broad payloads', () => {
  const hostile = validateExtensionMessage(extensionMessage({
    origin: 'http://attacker.invalid',
  }), { allowedOrigins: ['https://www.adidas.com'], nowIso: NOW });
  assert.equal(hostile.valid, false);
  assert.match(hostile.errors.join('\n'), /HTTPS origin required/);

  const stale = validateExtensionMessage(extensionMessage({
    createdAtIso: '2026-07-25T23:00:00.000Z',
  }), { allowedOrigins: ['https://www.adidas.com'], nowIso: NOW });
  assert.match(stale.errors.join('\n'), /stale/);

  const broadMessage = {
    ...extensionMessage(),
    wardrobe: [{ productId: 'private-item' }],
  };
  const broad = validateExtensionMessage(
    broadMessage,
    { allowedOrigins: ['https://www.adidas.com'], nowIso: NOW },
  );
  assert.equal(broad.valid, false);
  assert.match(broad.errors.join('\n'), /unknown key "wardrobe"/);
  assert.match(findSensitiveKeys(broadMessage).join('\n'), /sensitive key "wardrobe"/);
});

test('deletion completion requires all stores, sessions, backups, and verification evidence', () => {
  const complete = evaluateDeletionCompletion({
    primaryRecordsDeleted: true,
    privateObjectsDeleted: true,
    providerSessionRevoked: true,
    backupExpiryScheduled: true,
    verificationCompletedAtIso: NOW,
  });
  assert.deepEqual(complete, { complete: true, errors: [] });

  const incomplete = evaluateDeletionCompletion({
    primaryRecordsDeleted: true,
    privateObjectsDeleted: false,
    providerSessionRevoked: true,
    backupExpiryScheduled: false,
    verificationCompletedAtIso: null,
  });
  assert.equal(incomplete.complete, false);
  assert.match(incomplete.errors.join('\n'), /privateObjectsDeleted/);
  assert.match(incomplete.errors.join('\n'), /backupExpiryScheduled/);
  assert.match(incomplete.errors.join('\n'), /verificationCompletedAtIso/);
});

test('secret-shaped and private payload keys are detected recursively', () => {
  const findings = findSensitiveKeys({
    safe: {
      accessToken: 'not-a-real-token',
      bodyMeasurements: { chest: 40 },
    },
  });
  assert.equal(findings.length, 2);
});
