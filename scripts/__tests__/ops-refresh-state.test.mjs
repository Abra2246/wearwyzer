import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFRESH_OUTCOME,
  computeRefreshOutcome,
  refreshOutcomeLabel,
  relativeTimeFromNow,
  refreshButtonLabel,
} from '../ops-refresh-state.mjs';

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
