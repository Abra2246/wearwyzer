// Verified supporting-item link engine v1 (issue #24) — affiliate
// coverage calculation and threshold-shortfall logging. Pure,
// dependency-free. Implements the issue's "affiliate coverage operating
// rule" exactly: 80–90% of displayed, customer-facing products should
// carry a verified eligible affiliate offer, measured per guide and
// portfolio-wide; a guide that cannot honestly reach the threshold may
// still publish, but only with an explicit, logged shortfall — coverage
// is a reporting/quality-gate signal, never a reason to swap in a worse
// or inaccurate item (this module has no ability to do that substitution
// at all — see scripts/link-engine.mjs for where alternative substitution
// actually happens, entirely independent of coverage math).
//
// Canonical spec: docs/LINK_ENGINE_V1.md

import { isCoverageEligibleOffer } from './link-engine-verifier.mjs';

export const COVERAGE_TARGET = Object.freeze({ minPct: 80, maxPct: 90 });

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pct(numerator, denominator) {
  return denominator === 0 ? 0 : round2((numerator / denominator) * 100);
}

/**
 * Coverage for one guide from its resolved supporting-item results
 * (scripts/link-engine.mjs `resolveSupportingItem` outputs — hero and
 * supporting items count identically, per the issue). A `needs-human`
 * result never counts as covered, exact or alternative.
 */
export function computeGuideCoverage(guideId, resolvedItems) {
  const items = resolvedItems || [];
  const totalItems = items.length;
  const eligibleItems = items.filter((r) => r.outcome === 'verified' && isCoverageEligibleOffer(r.offer)).length;
  const coveragePct = pct(eligibleItems, totalItems);
  const meetsTarget = coveragePct >= COVERAGE_TARGET.minPct;
  return {
    guideId,
    totalItems,
    eligibleItems,
    coveragePct,
    meetsTarget,
    shortfallPct: meetsTarget ? 0 : round2(COVERAGE_TARGET.minPct - coveragePct),
  };
}

/** Portfolio-level rollup — a straight sum across every guide's items, not an average of per-guide percentages (so a large guide doesn't get diluted to the same weight as a 3-item one). */
export function computePortfolioCoverage(guideCoverages) {
  const coverages = guideCoverages || [];
  const totalItems = coverages.reduce((sum, c) => sum + c.totalItems, 0);
  const eligibleItems = coverages.reduce((sum, c) => sum + c.eligibleItems, 0);
  const coveragePct = pct(eligibleItems, totalItems);
  return {
    guideCount: coverages.length,
    totalItems,
    eligibleItems,
    coveragePct,
    meetsTarget: coveragePct >= COVERAGE_TARGET.minPct,
  };
}

/**
 * Explicit shortfall log entry for a guide below the minimum target —
 * `null` when the guide meets it, so a caller can simply skip logging.
 * Every non-eligible item is named with its concrete reason (never just a
 * bare percentage), per the issue's "shortfall is explicitly logged with
 * coverage percentage and reasons" requirement.
 */
export function logCoverageShortfall(guideCoverage, resolvedItems, { now } = {}) {
  if (!guideCoverage || guideCoverage.meetsTarget) return null;
  const reasons = (resolvedItems || [])
    .filter((r) => !(r.outcome === 'verified' && isCoverageEligibleOffer(r.offer)))
    .map((r) => ({
      outfitItemId: r.intendedItem?.outfitItemId ?? null,
      label: r.intendedItem?.label ?? null,
      reason: r.outcome === 'needs-human' ? r.reason : r.offer ? r.offer.linkStatus : 'unknown',
    }));

  return {
    guideId: guideCoverage.guideId,
    coveragePct: guideCoverage.coveragePct,
    targetMinPct: COVERAGE_TARGET.minPct,
    shortfallPct: guideCoverage.shortfallPct,
    loggedAtIso: now || new Date().toISOString(),
    reasons,
  };
}

/**
 * A single shortfall is a data point; a *repeated* shortfall for the same
 * guide across multiple revalidation runs is what the issue calls "a
 * sourcing-priority signal" — this aggregates a log of shortfall entries
 * (one per run) into a per-guide recurrence count, flagging guideIds that
 * have shortfallen twice or more.
 */
export function trackShortfallRecurrence(shortfallLogEntries) {
  const counts = new Map();
  for (const entry of shortfallLogEntries || []) {
    if (!entry) continue;
    counts.set(entry.guideId, (counts.get(entry.guideId) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([guideId, occurrences]) => ({ guideId, occurrences, isSourcingPriority: occurrences >= 2 }))
    .sort((a, b) => b.occurrences - a.occurrences);
}
