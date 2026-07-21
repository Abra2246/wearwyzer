// Runtime-only affiliate credential boundary (issue #25). All provider I/O
// is injected. Returned state and audit records are safe to commit/display.

import {
  AFFILIATE_ENVIRONMENTS,
  buildCredentialRegistryEntry,
  providerSecretName,
  validateAffiliateProvider,
} from './affiliate-connector-schema.mjs';

const SAFE_ERROR_TYPES = Object.freeze([
  'missing-secret', 'invalid-token', 'insufficient-scope', 'expired',
  'revoked', 'pending-approval', 'provider-unavailable', 'unknown',
]);

function safeErrorType(value) {
  return SAFE_ERROR_TYPES.includes(value) ? value : 'unknown';
}

function connectionState(provider, environment, nowIso, state) {
  return {
    ...buildCredentialRegistryEntry(provider, environment, {
      status: state.status,
      lastVerifiedIso: state.lastVerifiedIso || null,
      expiresAtIso: state.expiresAtIso || null,
    }),
    grantedScopes: [...(state.grantedScopes || [])],
    needsHuman: Boolean(state.needsHuman),
    reasonCode: state.reasonCode || null,
    reason: state.reason || null,
    checkedAtIso: nowIso,
  };
}

export function readAffiliateSecrets(provider, environment, env = process.env) {
  if (!AFFILIATE_ENVIRONMENTS.includes(environment)) throw new Error(`invalid affiliate environment: ${environment}`);
  const values = {};
  const missing = [];
  for (const field of provider.credentialFields || []) {
    const name = providerSecretName(provider.id, environment, field.key);
    const value = typeof env[name] === 'string' && env[name].trim() ? env[name] : null;
    if (value) values[field.key] = value;
    else if (field.required) missing.push(name);
  }
  return { values, missing };
}

export function buildAffiliateAuditEvent({ providerId, environment, operation, outcome, nowIso, reasonCode = null }) {
  return { providerId, environment, operation, outcome, reasonCode, timestampIso: nowIso };
}

export async function testAffiliateConnection({ provider, environment, env = process.env, transport, nowIso = new Date().toISOString() }) {
  const definitionErrors = validateAffiliateProvider(provider);
  if (definitionErrors.length) throw new Error(definitionErrors.join('; '));
  if (!transport || typeof transport.validate !== 'function') throw new Error('affiliate transport.validate is required');

  const { values: credentials, missing } = readAffiliateSecrets(provider, environment, env);
  if (missing.length) {
    return connectionState(provider, environment, nowIso, {
      status: 'disconnected', needsHuman: true, reasonCode: 'missing-secret',
      reason: `Add the required ${environment} secret${missing.length === 1 ? '' : 's'} in repository or hosting settings.`,
    });
  }

  let result;
  try {
    result = await transport.validate({ credentials, environment, requiredScopes: [...provider.requiredScopes] });
  } catch {
    result = { ok: false, errorType: 'provider-unavailable' };
  }

  const errorType = safeErrorType(result?.errorType);
  const grantedScopes = Array.isArray(result?.grantedScopes) ? result.grantedScopes : [];
  const missingScopes = provider.requiredScopes.filter((scope) => !grantedScopes.includes(scope));
  const expiresMs = Date.parse(result?.expiresAtIso || '');
  const nowMs = Date.parse(nowIso);

  if (result?.accountState === 'pending' || errorType === 'pending-approval') {
    return connectionState(provider, environment, nowIso, {
      status: 'pending-approval', needsHuman: true, reasonCode: 'pending-approval',
      reason: 'The affiliate program requires provider approval before activation.', grantedScopes,
    });
  }
  if (errorType === 'revoked' || errorType === 'invalid-token') {
    return connectionState(provider, environment, nowIso, {
      status: 'disconnected', needsHuman: true, reasonCode: errorType,
      reason: 'The provider credential is invalid or revoked; rotate it in secret settings.', grantedScopes,
    });
  }
  if (errorType === 'expired' || (Number.isFinite(expiresMs) && expiresMs <= nowMs)) {
    return connectionState(provider, environment, nowIso, {
      status: 'expired', needsHuman: !result?.refreshSupported, reasonCode: 'expired',
      reason: result?.refreshSupported ? 'Credential expired and is eligible for refresh.' : 'Credential expired; rotate it in secret settings.',
      grantedScopes, expiresAtIso: result?.expiresAtIso || null,
    });
  }
  if (missingScopes.length || errorType === 'insufficient-scope') {
    return connectionState(provider, environment, nowIso, {
      status: 'degraded', needsHuman: true, reasonCode: 'insufficient-scope',
      reason: `Reconnect with the required least-privilege scope${missingScopes.length === 1 ? '' : 's'}.`, grantedScopes,
      expiresAtIso: result?.expiresAtIso || null,
    });
  }
  if (!result?.ok) {
    return connectionState(provider, environment, nowIso, {
      status: 'degraded', needsHuman: true, reasonCode: errorType,
      reason: 'Provider connectivity could not be verified. Check the provider status and adapter configuration.', grantedScopes,
    });
  }
  return connectionState(provider, environment, nowIso, {
    status: 'connected', lastVerifiedIso: nowIso, expiresAtIso: result.expiresAtIso || null, grantedScopes,
  });
}

export async function refreshAffiliateConnection({ provider, environment, env = process.env, transport, nowIso = new Date().toISOString() }) {
  if (!transport || typeof transport.refresh !== 'function') throw new Error('affiliate transport.refresh is required');
  const { values: credentials, missing } = readAffiliateSecrets(provider, environment, env);
  if (missing.length) return testAffiliateConnection({ provider, environment, env, transport, nowIso });
  try {
    await transport.refresh({ credentials, environment });
  } catch {
    return connectionState(provider, environment, nowIso, {
      status: 'degraded', needsHuman: true, reasonCode: 'provider-unavailable',
      reason: 'Automatic refresh failed; verify the provider and rotate the credential if needed.',
    });
  }
  return testAffiliateConnection({ provider, environment, env, transport, nowIso });
}

export async function revokeAffiliateConnection({ provider, environment, env = process.env, transport, nowIso = new Date().toISOString() }) {
  if (!transport || typeof transport.revoke !== 'function') throw new Error('affiliate transport.revoke is required');
  const { values: credentials, missing } = readAffiliateSecrets(provider, environment, env);
  if (missing.length) {
    return connectionState(provider, environment, nowIso, {
      status: 'disconnected', needsHuman: false, reasonCode: 'missing-secret',
      reason: 'No stored credential remains for this provider environment.',
    });
  }
  try {
    await transport.revoke({ credentials, environment });
    return connectionState(provider, environment, nowIso, {
      status: 'disconnected', needsHuman: false, reasonCode: 'revoked',
      reason: 'Provider access was revoked. Remove the corresponding stored secrets.',
    });
  } catch {
    return connectionState(provider, environment, nowIso, {
      status: 'degraded', needsHuman: true, reasonCode: 'provider-unavailable',
      reason: 'Revocation could not be confirmed; retry with the provider before deleting the stored secret.',
    });
  }
}

export function isAffiliateAdapterUsable(connection) {
  return connection?.status === 'connected' && connection.needsHuman === false;
}
