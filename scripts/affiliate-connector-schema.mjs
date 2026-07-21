// Safe metadata contract for affiliate connections (issue #25). Secret
// values never belong in any shape exported by this module.

export const AFFILIATE_ENVIRONMENTS = Object.freeze(['sandbox', 'production']);
export const AFFILIATE_AUTH_MODES = Object.freeze(['oauth', 'static-secret']);
export const AFFILIATE_STATUSES = Object.freeze([
  'connected',
  'pending-approval',
  'degraded',
  'expired',
  'disconnected',
]);

const FORBIDDEN_SCOPE_PATTERN = /(payout|bank|tax|owner|billing|delete|admin)/i;
const SECRET_FIELD_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export function providerSecretName(providerId, environment, field) {
  const normalized = [providerId, environment, field]
    .map((value) => String(value).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase())
    .join('_');
  return `AFFILIATE_${normalized}`;
}

export function validateAffiliateProvider(provider) {
  const errors = [];
  if (!provider || typeof provider !== 'object') return ['provider must be an object'];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(provider.id || '')) errors.push('provider.id must be kebab-case');
  if (typeof provider.name !== 'string' || !provider.name.trim()) errors.push('provider.name is required');
  if (!AFFILIATE_AUTH_MODES.includes(provider.authMode)) errors.push('provider.authMode is invalid');
  if (!Array.isArray(provider.requiredScopes) || provider.requiredScopes.length === 0) errors.push('provider.requiredScopes must be non-empty');
  for (const scope of provider.requiredScopes || []) {
    if (FORBIDDEN_SCOPE_PATTERN.test(scope)) errors.push(`forbidden high-privilege scope: ${scope}`);
  }
  if (!Array.isArray(provider.credentialFields) || provider.credentialFields.length === 0) errors.push('provider.credentialFields must be non-empty');
  for (const field of provider.credentialFields || []) {
    if (!field || !SECRET_FIELD_PATTERN.test(field.key || '')) errors.push('credential field keys must be lower camelCase');
    if (field && typeof field.required !== 'boolean') errors.push(`credential field ${field.key || '(unknown)'} must declare required`);
  }
  if (typeof provider.adapterVersion !== 'string' || !provider.adapterVersion.trim()) errors.push('provider.adapterVersion is required');
  return errors;
}

export function buildCredentialRegistryEntry(provider, environment, state = {}) {
  const errors = validateAffiliateProvider(provider);
  if (errors.length) throw new Error(errors.join('; '));
  if (!AFFILIATE_ENVIRONMENTS.includes(environment)) throw new Error(`invalid affiliate environment: ${environment}`);
  return {
    providerId: provider.id,
    providerName: provider.name,
    environment,
    authMode: provider.authMode,
    requiredScopes: [...provider.requiredScopes],
    secretNames: provider.credentialFields.map((field) => providerSecretName(provider.id, environment, field.key)),
    status: AFFILIATE_STATUSES.includes(state.status) ? state.status : 'disconnected',
    lastVerifiedIso: state.lastVerifiedIso || null,
    expiresAtIso: state.expiresAtIso || null,
    adapterVersion: provider.adapterVersion,
  };
}

