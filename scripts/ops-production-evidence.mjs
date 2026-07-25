// Sanitized, repository-backed production evidence for Mission Control v2.
// Missing artifacts are represented as unavailable (null metrics), never as
// zero. The live-feed CLI owns filesystem access; these helpers only turn
// already-parsed records into closed, public-safe summaries.

import { DEFAULT_LIMITS } from './openai-cost-controls.mjs';
import { COVERAGE_TARGET } from './link-engine-coverage.mjs';

const ACTIVE_GUIDE_STATUSES = new Set(['in-progress', 'needs-human']);

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function newest(records, timestampKey) {
  return [...records].sort((a, b) => {
    const aTime = Date.parse(a[timestampKey] || '') || 0;
    const bTime = Date.parse(b[timestampKey] || '') || 0;
    return bTime - aTime;
  })[0] || null;
}

function guideSummary(job) {
  if (!job) return null;
  return {
    jobId: typeof job.jobId === 'string' ? job.jobId : 'unknown',
    stage: typeof job.status === 'string' ? job.status : 'unknown',
    result: typeof job.status === 'string' ? job.status : 'unknown',
    updatedIso: validIso(job.updatedAt) || validIso(job.createdAt),
  };
}

export function summarizeGuideFactory({ jobs, statusEvents, available = true } = {}) {
  if (!available) {
    return {
      state: 'unavailable',
      currentJob: null,
      lastJob: null,
      queuedCount: null,
      lastMeaningfulEventIso: null,
    };
  }
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const current = safeJobs.find((job) => ACTIVE_GUIDE_STATUSES.has(job.status)) || null;
  const last = newest(
    safeJobs.map((job) => ({ ...job, _sortIso: validIso(job.updatedAt) || validIso(job.createdAt) })),
    '_sortIso'
  );
  const guideEvents = (Array.isArray(statusEvents) ? statusEvents : [])
    .filter((event) => typeof event?.type === 'string' && (event.type.startsWith('guide-') || event.type.includes('renderer')))
    .map((event) => event.timestampIso)
    .filter(validIso);

  return {
    state: current ? current.status : 'idle',
    currentJob: guideSummary(current),
    lastJob: guideSummary(last),
    queuedCount: safeJobs.filter((job) => job.status === 'approved').length,
    lastMeaningfulEventIso: newest(guideEvents.map((timestampIso) => ({ timestampIso })), 'timestampIso')?.timestampIso || null,
  };
}

export function summarizeImageRenderer({ ledger, available = true, now } = {}) {
  if (!available) {
    return {
      state: 'unavailable',
      mode: 'unavailable',
      lastResult: 'unavailable',
      monthlySpendUsd: null,
      monthlyCapUsd: DEFAULT_LIMITS.monthlyCapUsd,
      renderCount: null,
      failureCount: null,
      lastRunIso: null,
    };
  }

  const entries = Array.isArray(ledger) ? ledger : [];
  const nowDate = new Date(now || new Date().toISOString());
  const monthEntries = entries.filter((entry) => {
    const timestamp = new Date(entry.timestampIso);
    return !Number.isNaN(timestamp.getTime())
      && timestamp.getUTCFullYear() === nowDate.getUTCFullYear()
      && timestamp.getUTCMonth() === nowDate.getUTCMonth();
  });
  const last = newest(entries, 'timestampIso');
  const monthlySpendUsd = Math.round(monthEntries.reduce((sum, entry) => sum + (Number(entry.costUsd) || 0), 0) * 100) / 100;

  return {
    state: monthlySpendUsd >= DEFAULT_LIMITS.monthlyCapUsd ? 'budget-exceeded' : entries.length ? 'active' : 'idle',
    // Historical ledger entries do not record execution mode. Do not infer
    // simulation/dry-run/live from a dollar amount.
    mode: ['simulation', 'dry-run', 'live'].includes(last?.mode) ? last.mode : 'unavailable',
    lastResult: last ? (last.accepted ? 'accepted' : 'rejected') : 'unavailable',
    monthlySpendUsd,
    monthlyCapUsd: DEFAULT_LIMITS.monthlyCapUsd,
    renderCount: entries.length,
    failureCount: entries.filter((entry) => entry.accepted === false).length,
    lastRunIso: validIso(last?.timestampIso),
  };
}

export function summarizeAffiliate(report, { available = true } = {}) {
  if (!available || !report) {
    return {
      state: 'unavailable',
      guideCoverage: [],
      portfolioCoveragePct: null,
      targetMinPct: COVERAGE_TARGET.minPct,
      targetMaxPct: COVERAGE_TARGET.maxPct,
      verifiedCount: null,
      unverifiedCount: null,
      staleCount: null,
      brokenCount: null,
      outOfStockCount: null,
      reportIso: null,
    };
  }

  const portfolio = report.portfolioCoverage || {};
  const total = Number.isInteger(portfolio.totalItems) ? portfolio.totalItems : null;
  const verified = Number.isInteger(portfolio.eligibleItems) ? portfolio.eligibleItems : null;
  const coverage = typeof portfolio.coveragePct === 'number' ? portfolio.coveragePct : null;

  return {
    state: coverage === null ? 'unavailable' : coverage >= COVERAGE_TARGET.minPct ? 'on-target' : 'below-target',
    guideCoverage: (Array.isArray(report.guideCoverages) ? report.guideCoverages : []).map((entry) => ({
      guideId: String(entry.guideId || 'unknown'),
      coveragePct: typeof entry.coveragePct === 'number' ? entry.coveragePct : null,
      meetsTarget: entry.meetsTarget === true,
    })),
    portfolioCoveragePct: coverage,
    targetMinPct: COVERAGE_TARGET.minPct,
    targetMaxPct: COVERAGE_TARGET.maxPct,
    verifiedCount: verified,
    unverifiedCount: total !== null && verified !== null ? Math.max(0, total - verified) : null,
    // The v1 report does not currently split these failure classes. Keep
    // them unavailable rather than assigning the aggregate broken count.
    staleCount: null,
    brokenCount: Number.isInteger(report.brokenCount) ? report.brokenCount : null,
    outOfStockCount: null,
    reportIso: validIso(report.generatedAtIso),
  };
}
