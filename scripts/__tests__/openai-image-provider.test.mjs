import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, readApiKeyFromEnv, isRetryableErrorType, IMAGES_ENDPOINT, IMAGES_EDIT_ENDPOINT } from '../openai-image-provider.mjs';

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'status text',
    headers: { get: (name) => headers[name] || null },
    text: async () => JSON.stringify(body),
  };
}

test('readApiKeyFromEnv reads only OPENAI_API_KEY from the environment, never anything else', () => {
  assert.equal(readApiKeyFromEnv({ OPENAI_API_KEY: 'sk-test' }), 'sk-test');
  assert.equal(readApiKeyFromEnv({}), null);
  assert.equal(readApiKeyFromEnv({ OPENAI_API_KEY: '' }), null);
});

test('missing key fails closed without calling fetch', async () => {
  let called = false;
  const result = await generateImage({ apiKey: null, prompt: 'a hero jacket', fetchImpl: async () => { called = true; } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'missing_key');
  assert.equal(called, false);
});

test('successful text-to-image generation returns structured evidence', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, IMAGES_ENDPOINT);
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-image-2');
    assert.ok(!('image' in body));
    return jsonResponse(200, { data: [{ b64_json: 'ZmFrZQ==', revised_prompt: 'a navy jacket' }], usage: { total_tokens: 10 } }, { 'x-request-id': 'req_123' });
  };
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'a navy jacket', fetchImpl, now: '2026-07-13T00:00:00.000Z' });
  assert.equal(result.status, 'generated');
  assert.equal(result.imageBase64, 'ZmFrZQ==');
  assert.equal(result.revisedPrompt, 'a navy jacket');
  assert.equal(result.requestId, 'req_123');
  assert.deepEqual(result.usage, { total_tokens: 10 });
  assert.equal(result.timestampIso, '2026-07-13T00:00:00.000Z');
});

test('reference-image edit workflow hits the edits endpoint with the image payload', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, IMAGES_EDIT_ENDPOINT);
    const body = JSON.parse(init.body);
    assert.equal(body.image, 'refbase64==');
    return jsonResponse(200, { data: [{ b64_json: 'ZmFrZQ==' }] });
  };
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'edit', referenceImageBase64: 'refbase64==', fetchImpl });
  assert.equal(result.status, 'generated');
});

test('invalid key (401) is classified and fails closed', async () => {
  const fetchImpl = async () => jsonResponse(401, { error: { message: 'invalid api key' } });
  const result = await generateImage({ apiKey: 'sk-bad', prompt: 'x', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'invalid_key');
  assert.doesNotMatch(result.reason, /sk-bad/);
});

test('rate limit (429) is classified as retryable', async () => {
  const fetchImpl = async () => jsonResponse(429, { error: { message: 'rate limited' } });
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'x', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'rate_limited');
  assert.equal(isRetryableErrorType(result.errorType), true);
});

test('moderation refusal is classified distinctly from a generic error', async () => {
  const fetchImpl = async () => jsonResponse(400, { error: { code: 'content_policy_violation', message: 'refused' } });
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'x', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'moderation_refused');
  assert.equal(isRetryableErrorType(result.errorType), false);
});

test('malformed response (missing data) fails closed', async () => {
  const fetchImpl = async () => jsonResponse(200, { data: [] });
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'x', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'malformed_response');
});

test('non-JSON response body fails closed instead of throwing', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, text: async () => 'not json' });
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'x', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'malformed_response');
});

test('network error fails closed and is retryable', async () => {
  const fetchImpl = async () => { throw new Error('ECONNRESET'); };
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'x', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'network_error');
  assert.equal(isRetryableErrorType(result.errorType), true);
});

test('server error (500) is classified as retryable', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: { message: 'internal' } });
  const result = await generateImage({ apiKey: 'sk-live', prompt: 'x', fetchImpl });
  assert.equal(result.errorType, 'server_error');
  assert.equal(isRetryableErrorType(result.errorType), true);
});
