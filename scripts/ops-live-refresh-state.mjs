// Client-side polling helpers for Mission Control v2 (issue #42). Pure
// except `fetchLiveFeed`, which takes its `fetchImpl` as a parameter instead
// of calling the global `fetch` directly — same pure-logic/thin-IO split as
// scripts/ops-refresh-state.mjs, and reuses that module's main-branch/
// Pages-fallback fetch strategy for the same reason (GitHub Pages can lag
// the committed JSON by a further deploy cycle).
//
// Canonical spec: docs/OPS_DASHBOARD_V2.md

import { computeSourceState, DEFAULT_THRESHOLDS } from './ops-live-schema.mjs';

export const POLL_INTERVAL_MS = 45000; // issue #42 asks for "every 30-60 seconds"

// Exponential backoff on repeated fetch failures (issue #42's reliability
// requirement), capped so a long outage still checks a few times a minute
// rather than trailing off to nothing.
export const BACKOFF_BASE_MS = 45000;
export const BACKOFF_MAX_MS = 5 * 60000;
export const BACKOFF_FACTOR = 2;

// Client-visible connection state — distinct from any one source's
// live/delayed/offline state, which is about the *data*, not the poll loop
// itself. `updating` covers the brief window a fetch is in flight so a
// visible "checking now" state exists (issue #42's "poll ... with visible
// updating state").
export const CONNECTION_STATES = Object.freeze(['connected', 'updating', 'reconnecting', 'offline']);

// After this many consecutive failures, the poll loop gives up trying to
// look "connected" and reports offline outright rather than silently
// backing off forever.
export const MAX_CONSECUTIVE_FAILURES_BEFORE_OFFLINE = 4;

export function computeBackoffDelayMs(consecutiveFailures) {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  const delay = BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, consecutiveFailures - 1);
  return Math.min(delay, BACKOFF_MAX_MS);
}

export function computeConnectionState({ isFetching, consecutiveFailures }) {
  if (isFetching) return 'updating';
  if (consecutiveFailures === 0) return 'connected';
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_BEFORE_OFFLINE) return 'offline';
  return 'reconnecting';
}

const FEED_OWNER = 'Abra2246';
const FEED_REPO = 'wearwyzer';
const FEED_BRANCH = 'main';

export function buildLiveFeedUrls(nowMs) {
  return {
    primaryUrl: `https://raw.githubusercontent.com/${FEED_OWNER}/${FEED_REPO}/${FEED_BRANCH}/ops/live-feed.json?t=${nowMs}`,
    fallbackUrl: `./ops/live-feed.json?t=${nowMs}`,
  };
}

async function fetchLiveFeedJson(fetchImpl, url) {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || typeof data !== 'object' || !data.generatedAtIso) {
    throw new Error('invalid live-feed payload');
  }
  return data;
}

/** Same main-first, Pages-fallback strategy as scripts/ops-refresh-state.mjs's fetchStatusWithFallback. */
export async function fetchLiveFeed(fetchImpl, nowMs) {
  const { primaryUrl, fallbackUrl } = buildLiveFeedUrls(nowMs);
  try {
    return await fetchLiveFeedJson(fetchImpl, primaryUrl);
  } catch {
    return await fetchLiveFeedJson(fetchImpl, fallbackUrl);
  }
}

const CRITICAL_SOURCE_NAMES = Object.freeze(['engineering', 'deployment']);

/**
 * A committed `ops/live-feed.json` is a static snapshot: every `state`
 * field inside it was computed once, at generator-run time, relative to
 * that run's clock. A browser can fetch that exact same file successfully
 * — a real HTTP 200 — hours or days after the generator last ran and still
 * read those same baked-in `"live"` strings (issue #42's false-green P0:
 * `ops/live-feed.json` stayed stamped `"live"` for 4 days after the
 * generator workflow stopped landing commits). A successful fetch must
 * never be conflated with fresh data, so every render recomputes each
 * critical source's state — and the overall state — from `lastUpdatedIso`
 * against the caller's actual current time, using the exact same
 * thresholds and worst-of-critical-sources rule as the generator itself
 * (`computeSourceState` / `aggregateOverallState` in
 * scripts/ops-live-schema.mjs / scripts/ops-live-builder.mjs). The
 * worst-of rule is intentionally re-implemented here (4 lines) rather than
 * imported from ops-live-builder.mjs, which pulls in the handoff-watchdog
 * rule chain — unnecessary weight for browser code that only needs this
 * one aggregation.
 */
export function applyClientFreshness(doc, nowMs) {
  if (!doc || !doc.sources) return doc;

  const sources = {};
  for (const name of Object.keys(doc.sources)) {
    const source = doc.sources[name];
    if (!CRITICAL_SOURCE_NAMES.includes(name) || !source || !source.wired) {
      sources[name] = source;
      continue;
    }
    const thresholds = DEFAULT_THRESHOLDS[name];
    const state = computeSourceState(source.lastUpdatedIso, {
      now: nowMs,
      staleAfterMinutes: thresholds.staleAfterMinutes,
      offlineAfterMinutes: thresholds.offlineAfterMinutes,
    });
    sources[name] = { ...source, state };
  }

  const criticalStates = CRITICAL_SOURCE_NAMES.map((name) => sources[name].state);
  const overallState = criticalStates.includes('offline')
    ? 'offline'
    : criticalStates.includes('delayed')
      ? 'delayed'
      : 'live';

  return { ...doc, sources, overallState };
}

export function relativeTimeFromNow(isoOrMs, nowMs) {
  if (!isoOrMs) return 'unknown';
  const diffMs = nowMs - new Date(isoOrMs).getTime();
  if (Number.isNaN(diffMs)) return 'unknown';
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return minutes + ' minutes ago';
  const hours = Math.round(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return hours + ' hours ago';
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day ago' : days + ' days ago';
}
