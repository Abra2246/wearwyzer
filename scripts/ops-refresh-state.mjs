// Pure helpers for Mission Control's manual "Refresh" button (issue #40).
//
// The dashboard's Refresh button cache-busts and re-fetches ops/status.json,
// but the backend generator only publishes a new snapshot on a schedule/push
// trigger (see .github/workflows/ops-status-refresh.yml). A click can
// legitimately re-fetch the *same* snapshot. This module is the deterministic,
// browser-and-Node-importable piece that decides what the button should say
// afterwards, so ops.dc.html's inline controller stays a thin caller and the
// logic itself is unit-testable (dc.html controllers can't be imported by
// node:test directly).
//
// No I/O, no DOM, no fetch — same pure-logic/thin-IO split as
// scripts/ops-status-builder.mjs and scripts/queue-rules.mjs.

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
