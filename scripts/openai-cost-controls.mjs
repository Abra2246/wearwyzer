// Cost, rate, and retry controls for the OpenAI image renderer (issue
// #18, section 6). Pure — no I/O, no timers, no clock reads. The caller
// (scripts/openai-hybrid-renderer.mjs / scripts/openai-renderer-cli.mjs)
// supplies `now` and persists/reloads the spend ledger — the same
// append-only-log pattern scripts/record-status-event.mjs already uses
// for automation/status/events.jsonl, applied here to
// automation/status/openai-spend.jsonl.
//
// Canonical spec: docs/OPENAI_IMAGE_RENDERER_V1.md
//
// Approved pilot defaults (issue #18 comment thread): $0.30 hard cap per
// guide, $30 monthly ceiling, max 2 attempts per editorial image, max 3
// accepted generated images per guide, medium-quality final generation.

export const DEFAULT_LIMITS = Object.freeze({
  perGuideCapUsd: 0.3,
  monthlyCapUsd: 30,
  maxAttemptsPerSlide: 2,
  maxAcceptedImagesPerGuide: 3,
});

// Conservative, published-pricing-style per-image cost estimates used only
// for pre-flight budget gating — never the actual bill. OpenAI's own
// invoice is the source of truth for real spend; this table exists so a
// job can be blocked *before* it would exceed a cap, not reconciled after.
export const ESTIMATED_COST_USD = Object.freeze({
  low: 0.02,
  medium: 0.07,
  high: 0.19,
});

export function estimateCost(quality) {
  return ESTIMATED_COST_USD[quality] ?? ESTIMATED_COST_USD.medium;
}

function isSameCalendarMonth(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

/** Sums ledger entries' costUsd, scoped to one guide or to the calendar month containing `now`. */
export function sumSpend(ledger, { guideId, now, scope } = {}) {
  return (ledger || [])
    .filter((entry) => (scope === 'guide' ? entry.guideId === guideId : true))
    .filter((entry) => (scope === 'month' ? isSameCalendarMonth(entry.timestampIso, now) : true))
    .reduce((sum, entry) => sum + (entry.costUsd || 0), 0);
}

export function countAcceptedImages(ledger, guideId) {
  return (ledger || []).filter((e) => e.guideId === guideId && e.accepted).length;
}

/** Would spending `estimatedCostUsd` more push either cap over its limit? Never guesses past a cap. */
export function evaluateBudget({ ledger = [], guideId, estimatedCostUsd, now, limits = DEFAULT_LIMITS } = {}) {
  const nowIso = now || new Date().toISOString();
  const perGuideSpent = sumSpend(ledger, { guideId, scope: 'guide' });
  const monthlySpent = sumSpend(ledger, { now: nowIso, scope: 'month' });

  if (perGuideSpent + estimatedCostUsd > limits.perGuideCapUsd) {
    return {
      allowed: false,
      reason: `per-guide cap exceeded: $${perGuideSpent.toFixed(2)} spent + $${estimatedCostUsd.toFixed(2)} estimated > $${limits.perGuideCapUsd.toFixed(2)} cap`,
      perGuideSpent,
      monthlySpent,
    };
  }
  if (monthlySpent + estimatedCostUsd > limits.monthlyCapUsd) {
    return {
      allowed: false,
      reason: `monthly cap exceeded: $${monthlySpent.toFixed(2)} spent + $${estimatedCostUsd.toFixed(2)} estimated > $${limits.monthlyCapUsd.toFixed(2)} cap`,
      perGuideSpent,
      monthlySpent,
    };
  }
  return { allowed: true, reason: null, perGuideSpent, monthlySpent };
}

/** Pure append — returns a new ledger array, never mutates the one passed in. */
export function recordSpend(ledger, entry) {
  return [...(ledger || []), entry];
}

export function isRetryableError(errorType) {
  return ['rate_limited', 'server_error', 'network_error'].includes(errorType);
}

/** Exponential backoff, capped — attempt is 1-indexed. */
export function computeBackoffDelayMs(attempt, { baseMs = 500, maxMs = 8000 } = {}) {
  const delay = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, maxMs);
}

/**
 * Single gate every generation attempt must pass before the provider is
 * ever called: max attempts per slide, max accepted images per guide, and
 * both budget caps. Never retries or spends past a limit — returns a
 * specific, actionable reason so the caller can stop and mark
 * needs-human instead of guessing whether "one more try" is safe.
 */
export function evaluateAttempt({ ledger = [], guideId, attempt, quality, now, limits = DEFAULT_LIMITS } = {}) {
  if (attempt > limits.maxAttemptsPerSlide) {
    return { allowed: false, reason: `max attempts per slide (${limits.maxAttemptsPerSlide}) exceeded` };
  }
  if (countAcceptedImages(ledger, guideId) >= limits.maxAcceptedImagesPerGuide) {
    return { allowed: false, reason: `max accepted images per guide (${limits.maxAcceptedImagesPerGuide}) already reached` };
  }
  const estimatedCostUsd = estimateCost(quality);
  const budget = evaluateBudget({ ledger, guideId, estimatedCostUsd, now, limits });
  if (!budget.allowed) return { allowed: false, reason: budget.reason };
  return { allowed: true, reason: null, estimatedCostUsd };
}
