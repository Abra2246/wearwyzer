import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBackoffDelayMs,
  computeConnectionState,
  fetchLiveFeed,
  buildLiveFeedUrls,
  applyClientFreshness,
  FEED_DELAYED_AFTER_MINUTES,
  FEED_OFFLINE_AFTER_MINUTES,
  POLL_INTERVAL_MS,
  BACKOFF_MAX_MS,
  MAX_CONSECUTIVE_FAILURES_BEFORE_OFFLINE,
} from '../ops-live-refresh-state.mjs';

const NOW = '2026-07-20T12:00:00.000Z';

function minutesAgo(minutes) {
  return new Date(new Date(NOW).getTime() - minutes * 60000).toISOString();
}

function feed({ generatedAtIso = NOW, engineeringAtIso = NOW, deploymentAtIso = NOW } = {}) {
  return {
    generatedAtIso,
    overallState: 'live',
    ceo: { headline: 'Everything is healthy — no action needed.', requiredAction: null, activeWorkSummary: null },
    sources: {
      engineering: { wired: true, state: 'live', lastUpdatedIso: engineeringAtIso, data: {} },
      deployment: { wired: true, state: 'live', lastUpdatedIso: deploymentAtIso, data: {} },
      content: { wired: false, state: 'not-wired', lastUpdatedIso: null, data: null },
    },
  };
}

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

test('applyClientFreshness: fresh feed remains live', () => {
  const result = applyClientFreshness(feed(), new Date(NOW).getTime());
  assert.equal(result.overallState, 'live');
  assert.match(result.ceo.headline, /healthy/i);
});

test('applyClientFreshness: feed at delayed threshold is delayed even after a successful fetch', () => {
  const result = applyClientFreshness(
    feed({ generatedAtIso: minutesAgo(FEED_DELAYED_AFTER_MINUTES) }),
    new Date(NOW).getTime()
  );
  assert.equal(result.overallState, 'delayed');
  assert.match(result.ceo.headline, /delayed/i);
  assert.doesNotMatch(result.ceo.headline, /healthy/i);
});

test('applyClientFreshness: multi-day-old feed is offline even when baked state says live', () => {
  const old = minutesAgo(4 * 24 * 60);
  const result = applyClientFreshness(
    feed({ generatedAtIso: old, engineeringAtIso: old, deploymentAtIso: old }),
    new Date(NOW).getTime()
  );
  assert.equal(result.overallState, 'offline');
  assert.equal(result.sources.engineering.state, 'offline');
  assert.match(result.ceo.requiredAction, /60 minutes/i);
});

test('applyClientFreshness: feed at offline threshold is offline', () => {
  const result = applyClientFreshness(
    feed({ generatedAtIso: minutesAgo(FEED_OFFLINE_AFTER_MINUTES) }),
    new Date(NOW).getTime()
  );
  assert.equal(result.overallState, 'offline');
});

test('applyClientFreshness: invalid generatedAtIso fails closed as offline', () => {
  const result = applyClientFreshness(feed({ generatedAtIso: 'not-a-date' }), new Date(NOW).getTime());
  assert.equal(result.overallState, 'offline');
});

test('applyClientFreshness: stale critical source makes a fresh feed delayed', () => {
  const result = applyClientFreshness(
    feed({ engineeringAtIso: minutesAgo(20) }),
    new Date(NOW).getTime()
  );
  assert.equal(result.sources.engineering.state, 'delayed');
  assert.equal(result.overallState, 'delayed');
});

test('applyClientFreshness: stored generator failure remains worse than fresh timestamps', () => {
  const staleState = feed();
  staleState.overallState = 'offline';
  staleState.sources.engineering.state = 'offline';
  const result = applyClientFreshness(staleState, new Date(NOW).getTime());
  assert.equal(result.sources.engineering.state, 'live');
  assert.equal(result.overallState, 'offline');
  assert.match(result.ceo.headline, /offline/i);
});
