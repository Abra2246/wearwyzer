// OpenAI Images API provider adapter (issue #18, section 1). Uses Node's
// built-in fetch — no npm package, matching this repo's no-package-manager
// rule (CLAUDE.md) — with an injectable fetchImpl, same pattern as
// scripts/queue-github-client.mjs and scripts/deploy-health-check.mjs, so
// every scenario below is testable without real network access or a real
// API key.
//
// Canonical spec: docs/OPENAI_IMAGE_RENDERER_V1.md
//
// Hard rules this module enforces:
//   - the API key is only ever accepted as an explicit `apiKey` argument
//     (readApiKeyFromEnv() is the one sanctioned way to source it, and it
//     only ever reads process.env.OPENAI_API_KEY — never argv, an issue
//     body, a file, or any other channel).
//   - the key is never logged, interpolated into an error message, or
//     included in any returned result object.
//   - every unhappy path (missing key, invalid key, rate limit, moderation
//     refusal, malformed response, network error) fails closed: this
//     module never throws for a classified error, it always returns a
//     structured `{ status: 'blocked', errorType, reason }` result so a
//     caller can route to needs-human/retry without guessing.

export const DEFAULT_MODEL = 'gpt-image-2';
export const IMAGES_ENDPOINT = 'https://api.openai.com/v1/images/generations';
export const IMAGES_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';

// Transient — worth retrying (with backoff, see scripts/openai-cost-controls.mjs).
export const RETRYABLE_ERROR_TYPES = Object.freeze(['rate_limited', 'server_error', 'network_error']);
// Terminal — retrying will not help; the caller must stop or escalate.
export const TERMINAL_ERROR_TYPES = Object.freeze([
  'missing_key',
  'invalid_key',
  'moderation_refused',
  'malformed_response',
]);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** The one sanctioned way to source the key — environment only, never any other channel. */
export function readApiKeyFromEnv(env = process.env) {
  const key = env.OPENAI_API_KEY;
  return isNonEmptyString(key) ? key : null;
}

function classifyHttpError(status, errorBody) {
  const code = String((errorBody && errorBody.error && (errorBody.error.code || errorBody.error.type)) || '');
  if (/moderation|content_policy|safety/i.test(code)) return 'moderation_refused';
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'malformed_response';
}

/**
 * Calls the OpenAI Images API exactly once — text-to-image when no
 * `referenceImageBase64` is given, reference-image edit workflow when one
 * is. No retry loop lives here; scripts/openai-hybrid-renderer.mjs decides
 * whether a retry is worth the spend (scripts/openai-cost-controls.mjs).
 */
export async function generateImage({
  apiKey,
  prompt,
  referenceImageBase64 = null,
  size = '1024x1024',
  quality = 'medium',
  model = DEFAULT_MODEL,
  fetchImpl = fetch,
  now,
} = {}) {
  const timestampIso = now || new Date().toISOString();

  if (!isNonEmptyString(apiKey)) {
    return { status: 'blocked', errorType: 'missing_key', reason: 'OPENAI_API_KEY is not set', timestampIso };
  }
  if (!isNonEmptyString(prompt)) {
    return { status: 'blocked', errorType: 'malformed_response', reason: 'prompt is empty', timestampIso };
  }

  const endpoint = referenceImageBase64 ? IMAGES_EDIT_ENDPOINT : IMAGES_ENDPOINT;
  const requestBody = referenceImageBase64
    ? { model, prompt, size, quality, image: referenceImageBase64 }
    : { model, prompt, size, quality };

  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    return { status: 'blocked', errorType: 'network_error', reason: `network error: ${err.message}`, timestampIso };
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return { status: 'blocked', errorType: 'malformed_response', reason: 'response body was not valid JSON', timestampIso };
  }

  if (!res.ok) {
    const errorType = classifyHttpError(res.status, json);
    const message = (json && json.error && json.error.message) || res.statusText || `HTTP ${res.status}`;
    return {
      status: 'blocked',
      errorType,
      reason: `OpenAI API error ${res.status}: ${message}`,
      httpStatus: res.status,
      timestampIso,
    };
  }

  if (!json || !Array.isArray(json.data) || json.data.length === 0 || !json.data[0]) {
    return { status: 'blocked', errorType: 'malformed_response', reason: 'response is missing data[0]', timestampIso };
  }

  const item = json.data[0];
  if (!isNonEmptyString(item.b64_json)) {
    return {
      status: 'blocked',
      errorType: 'malformed_response',
      reason: 'response item is missing b64_json image data',
      timestampIso,
    };
  }

  return {
    status: 'generated',
    errorType: null,
    imageBase64: item.b64_json,
    revisedPrompt: item.revised_prompt || null,
    model,
    size,
    quality,
    requestId: typeof res.headers?.get === 'function' ? res.headers.get('x-request-id') : null,
    usage: json.usage || null,
    timestampIso,
  };
}

export function isRetryableErrorType(errorType) {
  return RETRYABLE_ERROR_TYPES.includes(errorType);
}
