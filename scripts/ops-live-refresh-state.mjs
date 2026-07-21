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

// Feed-level thresholds are deliberately independent from the poll loop.
// A successful HTTP response proves connectivity, not that the generator
// produced the document recently. These values are the Issue #42 contract.
export const FEED_DELAYED_AFTER_MINUTES = 15;
export const FEED_OFFLINE_AFTER_MINUTES = 60;

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

function ageState(iso, nowMs, { delayedAfterMinutes, offlineAfterMinutes }) {
  const generatedMs = new Date(iso).getTime();
  if (!Number.isFinite(generatedMs) || !Number.isFinite(nowMs)) return 'offline';
  const ageMinutes = Math.max(0, (nowMs - generatedMs) / 60000);
  if (ageMinutes >= offlineAfterMinutes) return 'offline';
  if (ageMinutes >= delayedAfterMinutes) return 'delayed';
  return 'live';
}

function worstState(states) {
  if (states.includes('offline')) return 'offline';
  if (states.includes('delayed')) return 'delayed';
  return 'live';
}

/**
 * Recomputes effective health from wall-clock time on every render.
 *
 * A committed feed is a static snapshot. Fetching it successfully hours or
 * days later must not preserve the baked-in `"live"` strings. Feed age is
 * evaluated from `generatedAtIso`; critical sources are independently aged
 * from `lastUpdatedIso`. The worse result wins. CEO copy is also corrected so
 * stale data cannot retain an old "Everything is healthy" message.
 */
export function applyClientFreshness(doc, nowMs) {
  if (!doc || typeof doc !== 'object' || !doc.sources) return doc;

  const feedState = ageState(doc.generatedAtIso, nowMs, {
    delayedAfterMinutes: FEED_DELAYED_AFTER_MINUTES,
    offlineAfterMinutes: FEED_OFFLINE_AFTER_MINUTES,
  });

  const sources = { ...doc.sources };
  for (const name of CRITICAL_SOURCE_NAMES) {
    const source = sources[name];
    if (!source || !source.wired) continue;
    const thresholds = DEFAULT_THRESHOLDS[name];
    const state = computeSourceState(source.lastUpdatedIso, {
      now: nowMs,
      staleAfterMinutes: thresholds.staleAfterMinutes,
      offlineAfterMinutes: thresholds.offlineAfterMinutes,
    });
    sources[name] = { ...source, state };
  }

  const sourceStates = CRITICAL_SOURCE_NAMES.flatMap((name) => {
    const source = sources[name];
    if (!source || !source.wired) return ['offline'];
    return [source.state, doc.sources[name].state];
  });
  const overallState = worstState([feedState, doc.overallState, ...sourceStates]);

  let ceo = doc.ceo;
  if (overallState === 'offline') {
    ceo = {
      ...ceo,
      headline: 'Mission Control data is offline.',
      requiredAction: 'The live-feed generator has not produced trustworthy data within 60 minutes. Check the Ops Live Feed Refresh workflow.',
    };
  } else if (overallState === 'delayed') {
    ceo = {
      ...ceo,
      headline: 'Mission Control data is delayed.',
      requiredAction: 'The live-feed generator has not refreshed within 15 minutes. Treat the details below as last-known state.',
    };
  }

  return { ...doc, sources, overallState, ceo };
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
