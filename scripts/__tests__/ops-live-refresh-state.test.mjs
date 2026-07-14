import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBackoffDelayMs,
  computeConnectionState,
  fetchLiveFeed,
  buildLiveFeedUrls,
  POLL_INTERVAL_MS,
  BACKOFF_MAX_MS,
  MAX_CONSECUTIVE_FAILURES_BEFORE_OFFLINE,
} from '../ops-live-refresh-state.mjs';

test('computeBackoffDelayMs: no failures polls at the normal interval', () => {
  assert.equal(computeBackoffDelayMs(0), POLL_INTERVAL_MS);
});

test('computeBackoffDelayMs: grows exponentially with consecutive failures', () => {
  const d1 = computeBackoffDelayMs(1);
  const d2 = computeBackoffDelayMs(2);
  const d3 = computeBackoffDelayMs(3);
  assert.ok(d2 > d1, 'delay must increase after a second consecutive failure');
  assert.ok(d3 > d2, 'delay must increase after a third consecutive failure');
});

test('computeBackoffDelayMs: caps at BACKOFF_MAX_MS however many failures pile up', () => {
  assert.equal(computeBackoffDelayMs(20), BACKOFF_MAX_MS);
});

test('computeConnectionState: in-flight fetch always reports updating, even mid-outage', () => {
  assert.equal(computeConnectionState({ isFetching: true, consecutiveFailures: 3 }), 'updating');
});

test('computeConnectionState: no failures and not fetching -> connected', () => {
  assert.equal(computeConnectionState({ isFetching: false, consecutiveFailures: 0 }), 'connected');
});

test('computeConnectionState: a few failures -> reconnecting, not immediately offline', () => {
  assert.equal(computeConnectionState({ isFetching: false, consecutiveFailures: 1 }), 'reconnecting');
});

test('computeConnectionState: enough consecutive failures -> offline', () => {
  const state = computeConnectionState({ isFetching: false, consecutiveFailures: MAX_CONSECUTIVE_FAILURES_BEFORE_OFFLINE });
  assert.equal(state, 'offline');
});

test('buildLiveFeedUrls: primary points at raw main, fallback at the local Pages copy, both cache-busted', () => {
  const { primaryUrl, fallbackUrl } = buildLiveFeedUrls(12345);
  assert.match(primaryUrl, /raw\.githubusercontent\.com/);
  assert.match(primaryUrl, /ops\/live-feed\.json\?t=12345/);
  assert.match(fallbackUrl, /^\.\/ops\/live-feed\.json\?t=12345$/);
});

function fakeFetch(responses) {
  let call = 0;
  return async (url) => {
    const behavior = responses[call++];
    if (behavior === 'fail') throw new Error('network error');
    if (behavior === 'http-error') return { ok: false, status: 500 };
    return { ok: true, json: async () => behavior };
  };
}

test('fetchLiveFeed: uses the primary (main) response when it succeeds', async () => {
  const payload = { generatedAtIso: '2026-07-14T12:00:00.000Z' };
  const data = await fetchLiveFeed(fakeFetch([payload]), 1);
  assert.deepEqual(data, payload);
});

test('fetchLiveFeed: falls back to the Pages copy when the primary fetch throws', async () => {
  const payload = { generatedAtIso: '2026-07-14T12:00:00.000Z' };
  const data = await fetchLiveFeed(fakeFetch(['fail', payload]), 1);
  assert.deepEqual(data, payload);
});

test('fetchLiveFeed: throws when both primary and fallback fail (fully offline)', async () => {
  await assert.rejects(() => fetchLiveFeed(fakeFetch(['fail', 'http-error']), 1));
});
