import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAffiliateAuditEvent,
  isAffiliateAdapterUsable,
  readAffiliateSecrets,
  refreshAffiliateConnection,
  revokeAffiliateConnection,
  testAffiliateConnection,
} from '../affiliate-connector.mjs';
import {
  buildCredentialRegistryEntry,
  providerSecretName,
  validateAffiliateProvider,
} from '../affiliate-connector-schema.mjs';

const NOW = '2026-07-20T20:00:00.000Z';
const provider = {
  id: 'example-network', name: 'Example Network', authMode: 'oauth',
  requiredScopes: ['feeds:read', 'links:write', 'reports:read'],
  credentialFields: [{ key: 'accessToken', required: true }, { key: 'refreshToken', required: false }],
  adapterVersion: '1.0.0',
};
const env = {
  AFFILIATE_EXAMPLE_NETWORK_SANDBOX_ACCESS_TOKEN: 'sandbox-secret',
  AFFILIATE_EXAMPLE_NETWORK_PRODUCTION_ACCESS_TOKEN: 'production-secret',
};

function transport(overrides = {}) {
  return {
    async validate() {
      return { ok: true, grantedScopes: [...provider.requiredScopes], expiresAtIso: '2026-08-20T20:00:00.000Z', ...overrides };
    },
    async refresh() {},
    async revoke() {},
  };
}

test('provider definitions reject destructive or financial scopes', () => {
  assert.match(validateAffiliateProvider({ ...provider, requiredScopes: ['payout:write'] })[0], /forbidden/);
});

test('secret names are deterministic and environment-specific', () => {
  assert.equal(providerSecretName('example-network', 'sandbox', 'accessToken'), 'AFFILIATE_EXAMPLE_NETWORK_SANDBOX_ACCESS_TOKEN');
  assert.notEqual(providerSecretName('example-network', 'sandbox', 'accessToken'), providerSecretName('example-network', 'production', 'accessToken'));
});

test('registry stores secret names and metadata, never secret values', () => {
  const entry = buildCredentialRegistryEntry(provider, 'sandbox');
  assert.deepEqual(entry.secretNames, ['AFFILIATE_EXAMPLE_NETWORK_SANDBOX_ACCESS_TOKEN', 'AFFILIATE_EXAMPLE_NETWORK_SANDBOX_REFRESH_TOKEN']);
  assert.doesNotMatch(JSON.stringify(entry), /sandbox-secret/);
});

test('missing required secret disconnects only that provider with an actionable status', async () => {
  const state = await testAffiliateConnection({ provider, environment: 'sandbox', env: {}, transport: transport(), nowIso: NOW });
  assert.equal(state.status, 'disconnected');
  assert.equal(state.reasonCode, 'missing-secret');
  assert.equal(state.needsHuman, true);
});

test('valid least-privilege connection is connected and dashboard-ready', async () => {
  const state = await testAffiliateConnection({ provider, environment: 'sandbox', env, transport: transport(), nowIso: NOW });
  assert.equal(state.status, 'connected');
  assert.equal(state.needsHuman, false);
  assert.equal(isAffiliateAdapterUsable(state), true);
  assert.doesNotMatch(JSON.stringify(state), /sandbox-secret/);
});

test('invalid and revoked tokens fail closed', async () => {
  for (const errorType of ['invalid-token', 'revoked']) {
    const state = await testAffiliateConnection({ provider, environment: 'sandbox', env, transport: transport({ ok: false, errorType }), nowIso: NOW });
    assert.equal(state.status, 'disconnected');
    assert.equal(state.needsHuman, true);
  }
});

test('insufficient scope degrades without granting adapter access', async () => {
  const state = await testAffiliateConnection({ provider, environment: 'sandbox', env, transport: transport({ grantedScopes: ['feeds:read'] }), nowIso: NOW });
  assert.equal(state.status, 'degraded');
  assert.equal(state.reasonCode, 'insufficient-scope');
  assert.equal(isAffiliateAdapterUsable(state), false);
});

test('expired token reports whether automatic refresh is possible', async () => {
  const state = await testAffiliateConnection({ provider, environment: 'sandbox', env, transport: transport({ expiresAtIso: '2026-07-19T20:00:00.000Z', refreshSupported: true }), nowIso: NOW });
  assert.equal(state.status, 'expired');
  assert.equal(state.needsHuman, false);
});

test('pending provider approval remains explicit', async () => {
  const state = await testAffiliateConnection({ provider, environment: 'sandbox', env, transport: transport({ ok: false, accountState: 'pending' }), nowIso: NOW });
  assert.equal(state.status, 'pending-approval');
  assert.equal(state.needsHuman, true);
});

test('sandbox and production credentials are strictly isolated', () => {
  assert.equal(readAffiliateSecrets(provider, 'sandbox', env).values.accessToken, 'sandbox-secret');
  assert.equal(readAffiliateSecrets(provider, 'production', env).values.accessToken, 'production-secret');
});

test('refresh failure is sanitized and requires human attention', async () => {
  const failing = transport();
  failing.refresh = async () => { throw new Error('response accidentally contained secret'); };
  const state = await refreshAffiliateConnection({ provider, environment: 'sandbox', env, transport: failing, nowIso: NOW });
  assert.equal(state.status, 'degraded');
  assert.doesNotMatch(JSON.stringify(state), /accidentally contained secret/);
});

test('successful refresh revalidates the same environment without exposing tokens', async () => {
  let refreshCalls = 0;
  const refreshing = transport();
  refreshing.refresh = async ({ environment }) => { assert.equal(environment, 'sandbox'); refreshCalls += 1; };
  const state = await refreshAffiliateConnection({ provider, environment: 'sandbox', env, transport: refreshing, nowIso: NOW });
  assert.equal(refreshCalls, 1);
  assert.equal(state.status, 'connected');
  assert.doesNotMatch(JSON.stringify(state), /sandbox-secret/);
});

test('revocation returns a disconnected sanitized state', async () => {
  const state = await revokeAffiliateConnection({ provider, environment: 'production', env, transport: transport(), nowIso: NOW });
  assert.equal(state.status, 'disconnected');
  assert.equal(state.reasonCode, 'revoked');
  assert.equal(state.needsHuman, false);
  assert.doesNotMatch(JSON.stringify(state), /production-secret/);
});

test('audit events contain only identifiers and outcome enums', () => {
  const event = buildAffiliateAuditEvent({ providerId: provider.id, environment: 'sandbox', operation: 'connectivity-test', outcome: 'success', nowIso: NOW });
  assert.deepEqual(event, { providerId: provider.id, environment: 'sandbox', operation: 'connectivity-test', outcome: 'success', reasonCode: null, timestampIso: NOW });
});
