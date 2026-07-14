// Helpers for Mission Control's data fetch and manual "Refresh" button
// (issue #40, and the raw-branch/Pages-fallback fetch requested on PR #41).
//
// The dashboard's Refresh button cache-busts and re-fetches ops/status.json,
// but the backend generator only publishes a new snapshot on a schedule/push
// trigger (see .github/workflows/ops-status-refresh.yml), and the Pages-hosted
// copy can itself lag main by a further deploy cycle. A click can legitimately
// re-fetch the *same* snapshot. This module is the deterministic,
// browser-and-Node-importable piece that decides what the button should say
// afterwards, so ops.dc.html's inline controller stays a thin caller and the
// logic itself is unit-testable (dc.html controllers can't be imported by
// node:test directly).
//
// Everything is pure except `fetchStatusWithFallback`, which takes its
// `fetchImpl` as a parameter instead of calling the global `fetch` directly
// — same pure-logic/thin-IO split as scripts/ops-status-builder.mjs and
// scripts/queue-rules.mjs, just with the I/O boundary made swappable rather
// than pushed out of the module entirely.

export const REFRESH_OUTCOME = {
  UPDATED: 'updated',
  UNCHANGED: 'unchanged',
  FAILED: 'failed',
};

export const REFRESH_OUTCOME_LABEL = {
  [REFRESH_OUTCOME.UPDATED]: 'Updated',
  [REFRESH_OUTCOME.UNCHANGED]: 'No newer snapshot available',
  [REFRESH_OUTCOME.FAILED]: 'Refresh failed',
};

// Decide what a manual refresh click actually accomplished.
//
// `ok` is false whenever the fetch/parse threw (network error, non-2xx
// response, malformed JSON). Otherwise the new snapshot's generatedAtIso is
// compared against the one already on screen: identical (or no prior
// snapshot to compare against) means the backend hasn't published anything
// newer yet, which is expected behavior, not a failure.
export function computeRefreshOutcome({ ok, previousGeneratedAtIso, nextGeneratedAtIso }) {
  if (!ok || !nextGeneratedAtIso) return REFRESH_OUTCOME.FAILED;
  if (!previousGeneratedAtIso) return REFRESH_OUTCOME.UPDATED;
  return nextGeneratedAtIso === previousGeneratedAtIso
    ? REFRESH_OUTCOME.UNCHANGED
    : REFRESH_OUTCOME.UPDATED;
}

export function refreshOutcomeLabel(outcome) {
  return REFRESH_OUTCOME_LABEL[outcome] || '';
}

// Relative-time formatter shared by the backend "generated at" timestamp and
// the separate browser "last checked" timestamp. Accepts either an ISO
// string or an epoch-ms number since callers have both (status.generatedAtIso
// is ISO; the browser fetch timestamp is a Date.now() epoch-ms number).
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

export function refreshButtonLabel(isRefreshing) {
  return isRefreshing ? 'Refreshing…' : 'Refresh';
}

// GitHub Pages only serves whatever the last `pages.yml` deploy published,
// which can lag the committed ops/status.json snapshot by minutes (see
// ARCHITECTURE.md's "Decision — Mission Control ops dashboard v1"). Reading
// the file straight off `main` via raw.githubusercontent.com is fresher than
// the Pages copy; the Pages copy is kept as a fallback for when
// raw.githubusercontent.com itself is unreachable (rate-limited, offline,
// CDN hiccup) since this dashboard has no backend to proxy through.
const STATUS_OWNER = 'Abra2246';
const STATUS_REPO = 'wearwyzer';
const STATUS_BRANCH = 'main';

export const STATUS_SOURCE = {
  MAIN: 'main',
  PAGES_FALLBACK: 'pages-fallback',
};

export const STATUS_SOURCE_LABEL = {
  [STATUS_SOURCE.MAIN]: '',
  [STATUS_SOURCE.PAGES_FALLBACK]: ' (cached Pages copy — main was unreachable)',
};

export function buildStatusUrls(nowMs) {
  return {
    primaryUrl: `https://raw.githubusercontent.com/${STATUS_OWNER}/${STATUS_REPO}/${STATUS_BRANCH}/ops/status.json?t=${nowMs}`,
    fallbackUrl: `./ops/status.json?t=${nowMs}`,
  };
}

async function fetchStatusJson(fetchImpl, url) {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || typeof data !== 'object' || !data.generatedAtIso) {
    throw new Error('invalid status payload');
  }
  return data;
}

// Fetch ops/status.json, preferring the current `main` snapshot over the
// (potentially stale) Pages-deployed copy. `fetchImpl` is injected — same
// signature as the global `fetch` — so this stays deterministically
// testable under node:test without real network I/O, same pure-logic/thin-IO
// split as the rest of this module. Throws only if both the primary and
// fallback requests fail.
export async function fetchStatusWithFallback(fetchImpl, nowMs) {
  const { primaryUrl, fallbackUrl } = buildStatusUrls(nowMs);
  try {
    const data = await fetchStatusJson(fetchImpl, primaryUrl);
    return { data, source: STATUS_SOURCE.MAIN };
  } catch (primaryErr) {
    const data = await fetchStatusJson(fetchImpl, fallbackUrl);
    return { data, source: STATUS_SOURCE.PAGES_FALLBACK };
  }
}

export function statusSourceLabel(source) {
  return STATUS_SOURCE_LABEL[source] || '';
}
