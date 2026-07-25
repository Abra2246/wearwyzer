export const PRIVATE_ACCESS_POLICY_VERSION = 'private-access-policy-v1';
export const SESSION_MAX_AGE_MINUTES = 60;
export const ALLOWED_CLIENTS = Object.freeze(['web', 'mobile', 'portal', 'extension']);
export const ALLOWED_SCOPES = Object.freeze([
  'profile:read',
  'profile:write',
  'wardrobe:read',
  'wardrobe:write',
  'personalization:evaluate',
  'account:export',
  'account:delete',
]);
export const EXTENSION_MESSAGE_VERSION = 'extension-private-message-v1';
export const EXTENSION_MESSAGE_TYPES = Object.freeze(['active-product-evaluation']);

const SESSION_KEYS = new Set([
  'schemaVersion',
  'sessionId',
  'accountId',
  'authSubject',
  'client',
  'scopes',
  'issuedAtIso',
  'expiresAtIso',
  'csrfVerified',
]);
const EXTENSION_MESSAGE_KEYS = new Set([
  'schemaVersion',
  'messageId',
  'type',
  'origin',
  'productId',
  'matchState',
  'matchConfidence',
  'createdAtIso',
]);
const DELETION_EVIDENCE_KEYS = new Set([
  'primaryRecordsDeleted',
  'privateObjectsDeleted',
  'providerSessionRevoked',
  'backupExpiryScheduled',
  'verificationCompletedAtIso',
]);
const PRIVATE_PAYLOAD_KEYS = [
  /wardrobe/i,
  /measurement/i,
  /fitdna/i,
  /styledna/i,
  /profilepayload/i,
  /photo/i,
  /token/i,
  /secret/i,
  /cookie/i,
  /authorization/i,
];

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

function minutesBetween(startIso, endIso) {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000;
}

export function findSensitiveKeys(value, path = 'payload') {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...findSensitiveKeys(entry, `${path}[${index}]`)));
    return findings;
  }
  if (!isObject(value)) return findings;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_PAYLOAD_KEYS.some((pattern) => pattern.test(key))) {
      findings.push(`${path}: sensitive key "${key}" is not permitted`);
    }
    findings.push(...findSensitiveKeys(child, `${path}.${key}`));
  }
  return findings;
}

export function validatePrivateSession(session, { nowIso = new Date().toISOString() } = {}) {
  const errors = [];
  if (!isObject(session)) return { valid: false, errors: ['session: required object'] };
  unknownKeys(session, SESSION_KEYS, 'session', errors);
  if (session.schemaVersion !== PRIVATE_ACCESS_POLICY_VERSION) {
    errors.push(`session.schemaVersion: expected ${PRIVATE_ACCESS_POLICY_VERSION}`);
  }
  requiredString(session.sessionId, 'session.sessionId', errors);
  requiredString(session.accountId, 'session.accountId', errors);
  requiredString(session.authSubject, 'session.authSubject', errors);
  if (!ALLOWED_CLIENTS.includes(session.client)) errors.push('session.client: unsupported');
  if (!Array.isArray(session.scopes) || session.scopes.length === 0) {
    errors.push('session.scopes: expected non-empty array');
  } else {
    for (const scope of session.scopes) {
      if (!ALLOWED_SCOPES.includes(scope)) errors.push(`session.scopes: unsupported scope "${scope}"`);
    }
    if (new Set(session.scopes).size !== session.scopes.length) {
      errors.push('session.scopes: duplicate scopes are not permitted');
    }
  }
  if (!isIso(session.issuedAtIso)) errors.push('session.issuedAtIso: expected ISO timestamp');
  if (!isIso(session.expiresAtIso)) errors.push('session.expiresAtIso: expected ISO timestamp');
  if (isIso(session.issuedAtIso) && isIso(session.expiresAtIso)) {
    const lifetime = minutesBetween(session.issuedAtIso, session.expiresAtIso);
    if (lifetime <= 0 || lifetime > SESSION_MAX_AGE_MINUTES) {
      errors.push(`session: lifetime must be between 0 and ${SESSION_MAX_AGE_MINUTES} minutes`);
    }
    if (new Date(session.expiresAtIso).getTime() <= new Date(nowIso).getTime()) {
      errors.push('session: expired');
    }
    if (new Date(session.issuedAtIso).getTime() > new Date(nowIso).getTime() + 60_000) {
      errors.push('session: issued in the future');
    }
  }
  if (typeof session.csrfVerified !== 'boolean') {
    errors.push('session.csrfVerified: expected boolean');
  }
  return { valid: errors.length === 0, errors };
}

export function authorizePrivateAction({
  session,
  ownerAccountId,
  requiredScope,
  mutation = false,
  nowIso = new Date().toISOString(),
}) {
  const validation = validatePrivateSession(session, { nowIso });
  if (!validation.valid) return { allowed: false, reason: validation.errors[0] };
  if (session.accountId !== ownerAccountId) return { allowed: false, reason: 'cross-account-access-denied' };
  if (!ALLOWED_SCOPES.includes(requiredScope) || !session.scopes.includes(requiredScope)) {
    return { allowed: false, reason: 'required-scope-missing' };
  }
  if (mutation && session.client === 'web' && session.csrfVerified !== true) {
    return { allowed: false, reason: 'csrf-verification-required' };
  }
  return { allowed: true, reason: null };
}

export function validateExtensionMessage(message, {
  allowedOrigins = [],
  nowIso = new Date().toISOString(),
} = {}) {
  const errors = [];
  if (!isObject(message)) return { valid: false, errors: ['message: required object'] };
  unknownKeys(message, EXTENSION_MESSAGE_KEYS, 'message', errors);
  if (message.schemaVersion !== EXTENSION_MESSAGE_VERSION) {
    errors.push(`message.schemaVersion: expected ${EXTENSION_MESSAGE_VERSION}`);
  }
  requiredString(message.messageId, 'message.messageId', errors);
  if (!EXTENSION_MESSAGE_TYPES.includes(message.type)) errors.push('message.type: unsupported');
  if (typeof message.origin !== 'string' || !message.origin.startsWith('https://')) {
    errors.push('message.origin: HTTPS origin required');
  } else if (!allowedOrigins.includes(message.origin)) {
    errors.push('message.origin: not allowlisted');
  }
  requiredString(message.productId, 'message.productId', errors);
  if (!['exact', 'similar', 'unknown'].includes(message.matchState)) {
    errors.push('message.matchState: unsupported');
  }
  if (
    typeof message.matchConfidence !== 'number'
    || message.matchConfidence < 0
    || message.matchConfidence > 1
  ) errors.push('message.matchConfidence: expected number between 0 and 1');
  if (!isIso(message.createdAtIso)) errors.push('message.createdAtIso: expected ISO timestamp');
  else {
    const ageMinutes = minutesBetween(message.createdAtIso, nowIso);
    if (ageMinutes < -1 || ageMinutes > 5) errors.push('message.createdAtIso: stale or future message');
  }
  errors.push(...findSensitiveKeys(message, 'message'));
  return { valid: errors.length === 0, errors };
}

export function evaluateDeletionCompletion(evidence) {
  const errors = [];
  if (!isObject(evidence)) return { complete: false, errors: ['evidence: required object'] };
  unknownKeys(evidence, DELETION_EVIDENCE_KEYS, 'evidence', errors);
  for (const key of [
    'primaryRecordsDeleted',
    'privateObjectsDeleted',
    'providerSessionRevoked',
    'backupExpiryScheduled',
  ]) {
    if (evidence[key] !== true) errors.push(`evidence.${key}: explicit true required`);
  }
  if (!isIso(evidence.verificationCompletedAtIso)) {
    errors.push('evidence.verificationCompletedAtIso: expected ISO timestamp');
  }
  return { complete: errors.length === 0, errors };
}
