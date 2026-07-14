import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFRESH_OUTCOME,
  STATUS_SOURCE,
  computeRefreshOutcome,
  refreshOutcomeLabel,
  relativeTimeFromNow,
  refreshButtonLabel,
  buildStatusUrls,
  fetchStatusWithFallback,
  statusSourceLabel,
} from '../ops-refresh-state.mjs';

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status) {
  return { ok: false, status, json: async () => { throw new Error('should not parse body of a non-ok response'); } };
}

test('computeRefreshOutcome: failed fetch is always "failed", even with a prior snapshot', () => {
  assert.equal(
    computeRefreshOutcome({ ok: false, previousGeneratedAtIso: '2026-07-13T12:00:00.000Z', nextGeneratedAtIso: null }),
    REFRESH_OUTCOME.FAILED
  );
});

test('computeRefreshOutcome: successful fetch missing generatedAtIso counts as failed', () => {
  assert.equal(
    computeRefreshOutcome({ ok: true, previousGeneratedAtIso: '2026-07-13T12:00:00.000Z', nextGeneratedAtIso: null }),
    REFRESH_OUTCOME.FAILED
  );
});

test('computeRefreshOutcome: first successful load with no prior snapshot is "updated"', () => {
  assert.equal(
    computeRefreshOutcome({ ok: true, previousGeneratedAtIso: null, nextGeneratedAtIso: '2026-07-13T12:00:00.000Z' }),
    REFRESH_OUTCOME.UPDATED
  );
});

test('computeRefreshOutcome: identical generatedAtIso is "unchanged" (the stale-snapshot case)', () => {
  const iso = '2026-07-13T12:00:00.000Z';
  assert.equal(
    computeRefreshOutcome({ ok: true, previousGeneratedAtIso: iso, nextGeneratedAtIso: iso }),
    REFRESH_OUTCOME.UNCHANGED
  );
});

test('computeRefreshOutcome: a newer generatedAtIso is "updated"', () => {
  assert.equal(
    computeRefreshOutcome({
      ok: true,
      previousGeneratedAtIso: '2026-07-13T12:00:00.000Z',
      nextGeneratedAtIso: '2026-07-13T12:15:00.000Z',
    }),
    REFRESH_OUTCOME.UPDATED
  );
});

test('refreshOutcomeLabel: maps every outcome to the exact honest-feedback copy from issue #40', () => {
  assert.equal(refreshOutcomeLabel(REFRESH_OUTCOME.UPDATED), 'Updated');
  assert.equal(refreshOutcomeLabel(REFRESH_OUTCOME.UNCHANGED), 'No newer snapshot available');
  assert.equal(refreshOutcomeLabel(REFRESH_OUTCOME.FAILED), 'Refresh failed');
});

test('refreshOutcomeLabel: unknown outcome returns empty string rather than throwing', () => {
  assert.equal(refreshOutcomeLabel('bogus'), '');
});

test('refreshButtonLabel: reflects in-flight state', () => {
  assert.equal(refreshButtonLabel(true), 'Refreshing…');
  assert.equal(refreshButtonLabel(false), 'Refresh');
});

test('relativeTimeFromNow: accepts an ISO string', () => {
  const now = new Date('2026-07-13T12:10:00.000Z').getTime();
  assert.equal(relativeTimeFromNow('2026-07-13T12:00:00.000Z', now), '10 minutes ago');
});

test('relativeTimeFromNow: accepts an epoch-ms number (the browser fetch timestamp case)', () => {
  const then = new Date('2026-07-13T12:00:00.000Z').getTime();
  const now = new Date('2026-07-13T12:01:00.000Z').getTime();
  assert.equal(relativeTimeFromNow(then, now), '1 minute ago');
});

test('relativeTimeFromNow: null/undefined input is "unknown", not a thrown error', () => {
  assert.equal(relativeTimeFromNow(null, Date.now()), 'unknown');
  assert.equal(relativeTimeFromNow(undefined, Date.now()), 'unknown');
});

test('relativeTimeFromNow: unparseable value is "unknown"', () => {
  assert.equal(relativeTimeFromNow('not-a-date', Date.now()), 'unknown');
});

test('buildStatusUrls: primary is a cache-busted raw.githubusercontent.com main-branch URL', () => {
  const { primaryUrl } = buildStatusUrls(1234567890);
  assert.equal(
    primaryUrl,
    'https://raw.githubusercontent.com/Abra2246/wearwyzer/main/ops/status.json?t=1234567890'
  );
});

test('buildStatusUrls: fallback is the cache-busted Pages-relative path', () => {
  const { fallbackUrl } = buildStatusUrls(1234567890);
  assert.equal(fallbackUrl, './ops/status.json?t=1234567890');
});

test('fetchStatusWithFallback: primary success returns its data with source "main" and never calls the fallback URL', async () => {
  const calls = [];
  const data = { generatedAtIso: '2026-07-14T12:00:00.000Z' };
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse(data);
  };
  const result = await fetchStatusWithFallback(fetchImpl, 111);
  assert.deepEqual(result, { data, source: STATUS_SOURCE.MAIN });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/raw\.githubusercontent\.com\//);
});

test('fetchStatusWithFallback: primary network error falls back to the Pages copy with source "pages-fallback"', async () => {
  const calls = [];
  const data = { generatedAtIso: '2026-07-14T12:00:00.000Z' };
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://raw.githubusercontent.com/')) throw new Error('network error');
    return jsonResponse(data);
  };
  const result = await fetchStatusWithFallback(fetchImpl, 222);
  assert.deepEqual(result, { data, source: STATUS_SOURCE.PAGES_FALLBACK });
  assert.equal(calls.length, 2);
  assert.equal(calls[1], './ops/status.json?t=222');
});

test('fetchStatusWithFallback: primary non-2xx response falls back to the Pages copy', async () => {
  const data = { generatedAtIso: '2026-07-14T12:00:00.000Z' };
  const fetchImpl = async (url) => {
    if (url.startsWith('https://raw.githubusercontent.com/')) return errorResponse(404);
    return jsonResponse(data);
  };
  const result = await fetchStatusWithFallback(fetchImpl, 333);
  assert.deepEqual(result, { data, source: STATUS_SOURCE.PAGES_FALLBACK });
});

test('fetchStatusWithFallback: primary payload missing generatedAtIso is treated as invalid and falls back', async () => {
  const data = { generatedAtIso: '2026-07-14T12:00:00.000Z' };
  const fetchImpl = async (url) => {
    if (url.startsWith('https://raw.githubusercontent.com/')) return jsonResponse({ schemaVersion: 1 });
    return jsonResponse(data);
  };
  const result = await fetchStatusWithFallback(fetchImpl, 444);
  assert.deepEqual(result, { data, source: STATUS_SOURCE.PAGES_FALLBACK });
});

test('fetchStatusWithFallback: both primary and fallback failing rejects', async () => {
  const fetchImpl = async () => errorResponse(500);
  await assert.rejects(() => fetchStatusWithFallback(fetchImpl, 555));
});

test('statusSourceLabel: "main" source has no suffix (the common case is unremarkable)', () => {
  assert.equal(statusSourceLabel(STATUS_SOURCE.MAIN), '');
});

test('statusSourceLabel: "pages-fallback" source calls out that a cached copy was used', () => {
  assert.match(statusSourceLabel(STATUS_SOURCE.PAGES_FALLBACK), /cached/i);
});

test('statusSourceLabel: unknown source returns empty string rather than throwing', () => {
  assert.equal(statusSourceLabel('bogus'), '');
});
