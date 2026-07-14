// Pure assembly of the Mission Control ops dashboard's status object
// (issue #19) from already-sanitized, plain-data inputs. No I/O, no
// GitHub client, no filesystem — scripts/ops-status-cli.mjs gathers the
// inputs and is the only file that touches the network or disk, exactly
// the pure-logic/thin-IO split every other automation script in this
// repo already follows (scripts/queue-rules.mjs, scripts/handoff-watchdog-rules.mjs,
// scripts/guide-manifest-schema.mjs).
//
// Canonical spec: docs/OPS_DASHBOARD_V1.md
//
// This module never reads an issue/PR body, a comment, or a log line
// verbatim into the output — every string that reaches the returned
// object is either a short, already-sanitized `summary` field this
// repo's own automation already produces (scripts/status-log.mjs,
// scripts/notify-exception.mjs) or is built here from counts/enums/ids,
// then passed through `truncateSummary`. That is what keeps
// `ops/status.json` safe to publish unauthenticated (issue #19 section 6).

import { STATUS_SCHEMA_VERSION, DEFAULT_STALE_AFTER_MINUTES } from './ops-status-schema.mjs';
import { sumSpend, DEFAULT_LIMITS as OPENAI_DEFAULT_LIMITS } from './openai-cost-controls.mjs';
import { COVERAGE_TARGET } from './link-engine-coverage.mjs';

const MAX_SUMMARY_LENGTH = 160;

export function truncateSummary(text, maxLength = MAX_SUMMARY_LENGTH) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function shortSha(sha) {
  return isNonEmptyString(sha) ? sha.slice(0, 7) : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

const LABEL_TO_AUTOMATION_STATE = Object.freeze({
  'automation-failed': 'failed',
  blocked: 'blocked',
  review: 'review',
  'in-progress': 'working',
});

// Checked in this order — a failed/blocked issue is a more urgent signal
// than merely being "in review" or "in progress" if it somehow carries
// more than one of these labels at once.
const AUTOMATION_STATE_LABEL_PRIORITY = Object.freeze(['automation-failed', 'blocked', 'review', 'in-progress']);

function labelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l.name));
}

/** Derives the six-state automation status (issue #19 section 2) from the active issue's labels, or queue depth if nothing is active. */
export function deriveAutomationState(activeIssue, { readyCount = 0 } = {}) {
  if (activeIssue) {
    const names = labelNames(activeIssue.labels);
    for (const label of AUTOMATION_STATE_LABEL_PRIORITY) {
      if (names.includes(label)) return LABEL_TO_AUTOMATION_STATE[label];
    }
    return 'working';
  }
  return readyCount > 0 ? 'queued' : 'idle';
}

/** Selects the single active issue: the first open `in-progress` issue, if any. */
function selectActiveIssue(queue) {
  return (queue && queue.inProgressIssues && queue.inProgressIssues[0]) || null;
}

function buildActiveWork(activeIssue, queue) {
  if (!activeIssue) return null;
  const pr = queue && queue.activePr;
  return {
    issueNumber: activeIssue.number,
    title: truncateSummary(activeIssue.title, 120),
    url: activeIssue.html_url || null,
    prNumber: pr ? pr.number : null,
    prUrl: pr ? pr.html_url || null : null,
    lastActivityIso: activeIssue.updated_at || null,
  };
}

function buildQueue(queue) {
  const readyCount = (queue && queue.readyIssues && queue.readyIssues.length) || 0;
  const blockedCount = (queue && queue.blockedIssues && queue.blockedIssues.length) || 0;
  return { depth: readyCount, readyCount, blockedCount };
}

function buildCi(ci) {
  if (!ci) return { status: 'unknown', lastRunIso: null, lastRunUrl: null };
  return {
    status: ci.status,
    lastRunIso: ci.lastRunIso || null,
    lastRunUrl: ci.lastRunUrl || null,
  };
}

function buildDeployment(lastHealthyDeploy, liveCheck) {
  if (liveCheck) {
    return {
      status: liveCheck.healthy ? 'healthy' : 'failing',
      lastHealthyShaShort: shortSha(lastHealthyDeploy && lastHealthyDeploy.sha),
      lastCheckedIso: liveCheck.checkedAtIso || null,
    };
  }
  if (lastHealthyDeploy) {
    return {
      status: 'healthy',
      lastHealthyShaShort: shortSha(lastHealthyDeploy.sha),
      lastCheckedIso: lastHealthyDeploy.timestampIso || null,
    };
  }
  return { status: 'unknown', lastHealthyShaShort: null, lastCheckedIso: null };
}

function buildGuideFactory(guideJobs) {
  const jobs = guideJobs || [];
  const queuedCount = jobs.filter((j) => j.status === 'approved').length;
  const active = jobs.find((j) => j.status === 'in-progress');
  if (active) return { state: 'in-progress', activeJobId: active.jobId, queuedCount };
  const needsHuman = jobs.find((j) => j.status === 'needs-human');
  if (needsHuman) return { state: 'needs-human', activeJobId: needsHuman.jobId, queuedCount };
  return { state: 'idle', activeJobId: null, queuedCount };
}

function buildImageRenderer(spendLedger, { now, limits = OPENAI_DEFAULT_LIMITS, available = true } = {}) {
  if (!available) return { state: 'unavailable', monthlySpendUsd: null, monthlyCapUsd: null, budgetPct: null };
  const ledger = spendLedger || [];
  const monthlySpendUsd = Math.round(sumSpend(ledger, { now, scope: 'month' }) * 100) / 100;
  const monthlyCapUsd = limits.monthlyCapUsd;
  const budgetPct = monthlyCapUsd > 0 ? Math.round((monthlySpendUsd / monthlyCapUsd) * 100) : 0;
  const state = budgetPct >= 100 ? 'budget-exceeded' : ledger.length > 0 ? 'active' : 'idle';
  return { state, monthlySpendUsd, monthlyCapUsd, budgetPct };
}

// Verified supporting-item link engine (issue #24). `linkEngineReport` is
// the parsed contents of automation/status/link-engine-report.json (see
// scripts/link-engine-cli.mjs / docs/LINK_ENGINE_V1.md), or null when the
// CLI has never run — degrades to `unavailable` exactly like
// buildImageRenderer() does for a missing spend ledger, never guesses a
// coverage number that wasn't actually computed.
function buildLinkEngine(linkEngineReport) {
  if (!linkEngineReport) {
    return { state: 'unavailable', portfolioCoveragePct: null, targetMinPct: null, targetMaxPct: null, needsHumanCount: null, brokenCount: null, shortfallCount: null, lastRunIso: null };
  }
  const coveragePct = linkEngineReport.portfolioCoverage?.coveragePct ?? 0;
  return {
    state: coveragePct >= COVERAGE_TARGET.minPct ? 'on-target' : 'below-target',
    portfolioCoveragePct: coveragePct,
    targetMinPct: COVERAGE_TARGET.minPct,
    targetMaxPct: COVERAGE_TARGET.maxPct,
    needsHumanCount: linkEngineReport.needsHumanCount ?? 0,
    brokenCount: linkEngineReport.brokenCount ?? 0,
    shortfallCount: linkEngineReport.shortfallCount ?? 0,
    lastRunIso: linkEngineReport.generatedAtIso || null,
  };
}

function buildIncident(queue) {
  const incidentIssues = (queue && queue.incidentIssues) || [];
  const active = incidentIssues[0] || null;
  return {
    active: Boolean(active),
    issueNumber: active ? active.number : null,
    summary: active ? truncateSummary(active.title, 120) : null,
  };
}

function buildBlockers({ incident, guideFactory, linkEngine, automationState, activeWork }) {
  const blockers = [];
  if (incident.active) {
    blockers.push({
      summary: `Site incident open (#${incident.issueNumber}) — automation queue is suspended.`,
      issueNumber: incident.issueNumber,
      type: 'site-incident',
    });
  }
  if (guideFactory.state === 'needs-human') {
    blockers.push({
      summary: `Guide factory job "${guideFactory.activeJobId}" needs a human decision.`,
      issueNumber: null,
      type: 'guide-job-needs-human',
    });
  }
  if (linkEngine.state === 'below-target') {
    blockers.push({
      summary: `Affiliate link coverage is ${linkEngine.portfolioCoveragePct}% — below the ${linkEngine.targetMinPct}% target (${linkEngine.needsHumanCount} item(s) need a human).`,
      issueNumber: null,
      type: 'link-coverage-below-target',
    });
  }
  if ((automationState === 'blocked' || automationState === 'failed') && activeWork) {
    blockers.push({
      summary: `#${activeWork.issueNumber} "${activeWork.title}" is ${automationState} and needs attention.`,
      issueNumber: activeWork.issueNumber,
      type: `issue-${automationState}`,
    });
  }
  return blockers;
}

function computeOverallHealth({ incidentActive, deploymentStatus, ciStatus, automationState, guideFactoryState, imageRendererState, linkEngineState }) {
  if (incidentActive || deploymentStatus === 'failing' || ciStatus === 'failing') return 'red';
  if (
    automationState === 'failed' ||
    automationState === 'blocked' ||
    guideFactoryState === 'needs-human' ||
    imageRendererState === 'budget-exceeded' ||
    linkEngineState === 'below-target'
  ) {
    return 'yellow';
  }
  if (deploymentStatus === 'unknown' || ciStatus === 'unknown') return 'yellow';
  return 'green';
}

function latestIso(...values) {
  const times = values.filter(isNonEmptyString).map((v) => new Date(v).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

/**
 * Assembles the full `ops/status.json` document (matches the closed
 * schema in scripts/ops-status-schema.mjs exactly — no extra keys).
 *
 * `sources` fields are all optional/nullable so this degrades gracefully
 * when a data source is unavailable (e.g. no `GITHUB_TOKEN` in a local
 * run) rather than throwing:
 *   - statusEvents: array from scripts/record-status-event.mjs `readEvents()`
 *   - guideJobs: array of parsed automation/guide-jobs/*.json manifests
 *   - spendLedger: array from scripts/openai-spend-ledger.mjs `readLedger()`
 *   - lastHealthyDeploy: parsed automation/status/last-healthy-deploy.json, or null
 *   - liveDeployCheck: { healthy, checkedAtIso } from a fresh health check, or null
 *   - queue: { readyIssues, inProgressIssues, blockedIssues, incidentIssues, activePr }, or null
 *   - ci: { status, lastRunIso, lastRunUrl }, or null
 *   - imageRendererAvailable: false when spend-ledger data couldn't be read at all
 *   - linkEngineReport: parsed automation/status/link-engine-report.json, or null
 *     when scripts/link-engine-cli.mjs has never run (see that file / issue #24)
 */
export function buildOpsStatus(sources = {}, { now } = {}) {
  const nowIso = now || new Date().toISOString();
  const {
    statusEvents = [],
    guideJobs = [],
    spendLedger = [],
    lastHealthyDeploy = null,
    liveDeployCheck = null,
    queue = null,
    ci = null,
    imageRendererAvailable = true,
    linkEngineReport = null,
  } = sources;

  const activeIssue = selectActiveIssue(queue);
  const activeWork = buildActiveWork(activeIssue, queue);
  const queueOut = buildQueue(queue);
  const automationState = deriveAutomationState(activeIssue, { readyCount: queueOut.readyCount });
  const ciOut = buildCi(ci);
  const deploymentOut = buildDeployment(lastHealthyDeploy, liveDeployCheck);
  const guideFactoryOut = buildGuideFactory(guideJobs);
  const imageRendererOut = buildImageRenderer(spendLedger, { now: nowIso, available: imageRendererAvailable });
  const linkEngineOut = buildLinkEngine(linkEngineReport);
  const incidentOut = buildIncident(queue);
  const blockers = buildBlockers({
    incident: incidentOut,
    guideFactory: guideFactoryOut,
    linkEngine: linkEngineOut,
    automationState,
    activeWork,
  });

  const overallHealth = computeOverallHealth({
    incidentActive: incidentOut.active,
    deploymentStatus: deploymentOut.status,
    ciStatus: ciOut.status,
    automationState,
    guideFactoryState: guideFactoryOut.state,
    imageRendererState: imageRendererOut.state,
    linkEngineState: linkEngineOut.state,
  });

  const lastEventIso = statusEvents.length ? statusEvents[statusEvents.length - 1].timestampIso : null;
  const lastMeaningfulActivityIso = latestIso(
    lastEventIso,
    activeWork && activeWork.lastActivityIso,
    deploymentOut.lastCheckedIso
  );

  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    generatedAtIso: nowIso,
    overallHealth,
    automationState,
    activeWork,
    queue: queueOut,
    ci: ciOut,
    deployment: deploymentOut,
    guideFactory: guideFactoryOut,
    imageRenderer: imageRendererOut,
    linkEngine: linkEngineOut,
    incident: incidentOut,
    blockers,
    lastMeaningfulActivityIso,
    staleAfterMinutes: DEFAULT_STALE_AFTER_MINUTES,
  };
}
