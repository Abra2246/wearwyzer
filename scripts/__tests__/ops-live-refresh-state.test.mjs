import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBackoffDelayMs,
  computeConnectionState,
  fetchLiveFeed,
  buildLiveFeedUrls,
  applyClientFreshness,
  POLL_INTERVAL_MS,
  BACKOFF_MAX_MS,
  MAX_CONSECUTIVE_FAILURES_BEFORE_OFFLINE,
} from '../ops-live-refresh-state.mjs';
import { DEFAULT_THRESHOLDS } from '../ops-live-schema.mjs';

const NOW = '2026-07-18T16:00:00.000Z';

function minutesAgo(iso, minutes) {
  return new Date(new Date(iso).getTime() - minutes * 60000).toISOString();
}

function liveDoc({ engineeringUpdatedIso, deploymentUpdatedIso, bakedOverallState = 'live' }) {
  return {
    schemaVersion: 1,
    generatedAtIso: engineeringUpdatedIso,
    overallState: bakedOverallState,
    ceo: { headline: 'Everything is healthy — no action needed.', requiredAction: null, activeWorkSummary: null },
    sources: {
      engineering: { wired: true, state: 'live', lastUpdatedIso: engineeringUpdatedIso, fetchOk: true, data: {}, note: null },
      deployment: { wired: true, state: 'live', lastUpdatedIso: deploymentUpdatedIso, fetchOk: true, data: {}, note: null },
      content: { wired: false, state: 'not-wired', lastUpdatedIso: null, fetchOk: false, data: null, note: 'Phase 3.' },
      image: { wired: false, state: 'not-wired', lastUpdatedIso: null, fetchOk: false, data: null, note: 'Phase 3.' },
      affiliate: { wired: false, state: 'not-wired', lastUpdatedIso: null, fetchOk: false, data: null, note: 'Phase 3.' },
    },
    automationFeed: [],
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

// issue #42 P0: a multi-day-old ops/live-feed.json that a browser fetches
// successfully must never render as "Live" just because that string was
// what the generator wrote days ago.
test('applyClientFreshness: a multi-day-old feed reports offline even though every baked-in state says live', () => {
  const fourDaysAgo = minutesAgo(NOW, 4 * 24 * 60);
  const doc = liveDoc({ engineeringUpdatedIso: fourDaysAgo, deploymentUpdatedIso: fourDaysAgo });
  const fresh = applyClientFreshness(doc, new Date(NOW).getTime());
  assert.equal(fresh.sources.engineering.state, 'offline');
  assert.equal(fresh.sources.deployment.state, 'offline');
  assert.equal(fresh.overallState, 'offline');
});

test('applyClientFreshness: a successful fetch of stale (but not ancient) JSON reads delayed, not live', () => {
  const staleButRecent = minutesAgo(NOW, DEFAULT_THRESHOLDS.engineering.staleAfterMinutes + 5);
  const doc = liveDoc({ engineeringUpdatedIso: staleButRecent, deploymentUpdatedIso: NOW });
  const fresh = applyClientFreshness(doc, new Date(NOW).getTime());
  assert.equal(fresh.sources.engineering.state, 'delayed');
  assert.equal(fresh.sources.deployment.state, 'live');
  assert.equal(fresh.overallState, 'delayed', 'the worse of the two critical sources must win, even though the doc itself said live');
});

test('applyClientFreshness: a genuinely fresh feed still reports live (no false negative)', () => {
  const doc = liveDoc({ engineeringUpdatedIso: NOW, deploymentUpdatedIso: NOW });
  const fresh = applyClientFreshness(doc, new Date(NOW).getTime());
  assert.equal(fresh.overallState, 'live');
});

test('applyClientFreshness: a failed generator (no lastUpdatedIso at all) reads offline', () => {
  const doc = liveDoc({ engineeringUpdatedIso: NOW, deploymentUpdatedIso: NOW });
  doc.sources.engineering.lastUpdatedIso = null;
  const fresh = applyClientFreshness(doc, new Date(NOW).getTime());
  assert.equal(fresh.sources.engineering.state, 'offline');
  assert.equal(fresh.overallState, 'offline');
});

test('applyClientFreshness: not-wired and missing sources pass through untouched', () => {
  const doc = liveDoc({ engineeringUpdatedIso: NOW, deploymentUpdatedIso: NOW });
  const fresh = applyClientFreshness(doc, new Date(NOW).getTime());
  assert.equal(fresh.sources.content.state, 'not-wired');
  assert.equal(fresh.sources.image.state, 'not-wired');
  assert.equal(fresh.sources.affiliate.state, 'not-wired');
});

test('applyClientFreshness: passing a null doc is a no-op', () => {
  assert.equal(applyClientFreshness(null, new Date(NOW).getTime()), null);
});
