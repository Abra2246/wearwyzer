import { stableSerialize } from './ai-stylist-evaluator.mjs';
import { planDailyStylistProductionRequest } from './daily-stylist-production-boundary-contract.mjs';
import { runDailyStylistServiceSeam } from './daily-stylist-service-seam.mjs';

export const DAILY_STYLIST_WEB_TRANSPORT_CONTEXT_VERSION = 'daily-stylist-web-transport-context-v1';
export const DAILY_STYLIST_WEB_TRANSPORT_RESPONSE_VERSION = 'daily-stylist-web-transport-response-v1';

const TRANSPORT_CONTEXT_KEYS = new Set([
  'schemaVersion',
  'method',
  'mediaType',
  'sameOriginVerified',
  'csrfVerified',
  'requestId',
]);

// Every accepted, completed outcome the delegated seam can return, mapped to
// the closed client status vocabulary. The seam's own Grounded Stylist
// response (docs/GROUNDED_DAILY_OUTFIT_STYLIST_V1.md) already owns wording,
// ranking, ties, uncertainty, and abstention — this only renames its
// `outcome` value for the client.
const COMPLETED_OUTCOME_STATUS = Object.freeze({
  answer: 'ready',
  'review-required': 'review-required',
  abstain: 'abstained',
});

// Every stop step the accepted seam (docs/DAILY_STYLIST_PRODUCTION_BOUNDARY_V1.md,
// RESOLUTION_STEPS) can report, mapped to one minimized, actionable client
// status. This mapping is the entire adaptation: it never re-derives why a
// step failed, only renames the step for the client.
const STOPPED_STEP_STATUS = Object.freeze({
  'authenticate-session': 'unauthenticated',
  'authorize-same-account-ownership': 'unauthorized',
  'verify-active-personalization-consent': 'consent-required',
  'resolve-profile-reference': 'unresolved-context',
  'verify-wardrobe-snapshot-current': 'stale-snapshot',
  'derive-minimized-outfit-candidates': 'insufficient-candidates',
  'delegate-daily-outfit-intent': 'service-unavailable',
  'adapt-grounded-stylist-response': 'service-unavailable',
});

const NEXT_STEP_BY_STATUS = Object.freeze({
  'request-rejected': 'resend-valid-request',
  unauthenticated: 'sign-in-required',
  unauthorized: 'switch-to-authorized-account',
  'consent-required': 'grant-personalization-consent',
  'unresolved-context': 'reconnect-profile-reference',
  'stale-snapshot': 'refresh-wardrobe-snapshot',
  'insufficient-candidates': 'add-more-wardrobe-items',
  'service-unavailable': 'retry-later',
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function stableReference(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function echoRequestId(transportContext, requestBody) {
  if (typeof requestBody?.requestId === 'string' && requestBody.requestId.trim()) {
    return requestBody.requestId;
  }
  if (typeof transportContext?.requestId === 'string' && transportContext.requestId.trim()) {
    return transportContext.requestId;
  }
  return null;
}

// The closed set of trusted middleware outcomes this boundary may consult:
// method, media type, same-origin result, CSRF result, and request-ID/
// idempotency evidence. Nothing else — no header dump, no client IP, no
// user-agent — reaches this function, and it never re-derives any of these
// facts itself; it only refuses to proceed when a required outcome is
// missing or negative.
export function validateWebTransportContext(transportContext, requestBody) {
  if (
    !exactKeys(transportContext, TRANSPORT_CONTEXT_KEYS)
    || transportContext.schemaVersion !== DAILY_STYLIST_WEB_TRANSPORT_CONTEXT_VERSION
    || transportContext.method !== 'POST'
    || transportContext.mediaType !== 'application/json'
    || transportContext.sameOriginVerified !== true
    || transportContext.csrfVerified !== true
    || !stableReference(transportContext.requestId)
    || transportContext.requestId !== requestBody?.requestId
  ) {
    return { ok: false, error: 'closed-web-transport-context-required' };
  }
  return { ok: true };
}

function closedResponse(requestId, status, response = null) {
  return {
    ok: true,
    schemaVersion: DAILY_STYLIST_WEB_TRANSPORT_RESPONSE_VERSION,
    requestId,
    status,
    nextStep: NEXT_STEP_BY_STATUS[status],
    response,
  };
}

// Adapts a signed-in web request into the accepted Daily Stylist service seam
// (scripts/daily-stylist-service-seam.mjs) and back into one closed client
// response. This function owns exactly two things: the transport-only checks
// above, and the outcome-to-status renaming below. It authenticates nothing,
// authorizes nothing, resolves no private record, and ranks nothing — every
// one of those remains the seam's delegated responsibility, called unchanged.
export function runDailyStylistWebTransportBoundary({
  transportContext,
  requestBody,
  session,
  privateService,
  fixtureCandidateMode = 'ready',
  nowIso = new Date().toISOString(),
} = {}) {
  const requestId = echoRequestId(transportContext, requestBody);

  const transport = validateWebTransportContext(transportContext, requestBody);
  if (!transport.ok) return closedResponse(requestId, 'request-rejected');

  const planned = planDailyStylistProductionRequest(requestBody);
  if (!planned.ok) return closedResponse(requestId, 'request-rejected');

  const seamResult = runDailyStylistServiceSeam({
    session,
    requestEnvelope: requestBody,
    privateService,
    fixtureCandidateMode,
    nowIso,
  });
  if (!seamResult.ok) return closedResponse(planned.result.requestId, 'service-unavailable');

  if (seamResult.outcome === 'completed') {
    const status = COMPLETED_OUTCOME_STATUS[seamResult.response.outcome];
    return {
      ok: true,
      schemaVersion: DAILY_STYLIST_WEB_TRANSPORT_RESPONSE_VERSION,
      requestId: seamResult.requestId,
      status,
      nextStep: seamResult.response.nextStep,
      response: seamResult.response,
    };
  }

  const status = STOPPED_STEP_STATUS[seamResult.stoppedAtStep] ?? 'service-unavailable';
  return closedResponse(seamResult.requestId, status);
}

export function serializeDailyStylistWebTransportResponse(response) {
  return stableSerialize(response);
}
