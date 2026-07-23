// Pure assembly of Mission Control v2's live-data document (issue #42) from
// already-sanitized, plain-data inputs. No I/O, no GitHub client, no
// filesystem — scripts/ops-live-cli.mjs gathers the inputs and is the only
// file that touches the network or disk, same split as
// scripts/ops-status-builder.mjs.
//
// Canonical spec: docs/OPS_DASHBOARD_V2.md
//
// Core model: each wired source (`engineering`, `deployment`) carries its
// own `state` derived from how long ago it was *successfully* queried, not
// from how "interesting" its data is. A failed query keeps the previous
// run's data (last-known-good, issue #42's "preserve a last-known-good
// state while clearly labeling it stale") but the state ages toward
// `delayed`/`offline` because `lastUpdatedIso` doesn't advance. Overall
// health is never `live` unless every critical source is itself `live` —
// "no fake green."

import {
  LIVE_SCHEMA_VERSION,
  DEFAULT_THRESHOLDS,
  MAX_AUTOMATION_FEED_EVENTS,
  computeSourceState,
} from './ops-live-schema.mjs';
import { GRACE_PERIOD_MINUTES, minutesBetween } from './handoff-watchdog-rules.mjs';

const CRITICAL_SOURCES = Object.freeze(['engineering', 'deployment']);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function truncate(text, maxLength = 120) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

/**
 * Builds one wired source envelope. `fetchOk` is whether *this run's* query
 * for that source succeeded; `freshData` is only used when it did.
 * `previous` is that same source's envelope from the last committed
 * `ops/live-feed.json` (or null on a first-ever run) — carried forward
 * whenever the fresh fetch fails, so a transient API hiccup shows "delayed"
 * with real last-known data instead of blanking the dashboard.
 */
export function buildSource({ name, fetchOk, freshData, previous, now, thresholds }) {
  const lastUpdatedIso = fetchOk ? now : (previous && previous.wired ? previous.lastUpdatedIso : null);
  const data = fetchOk ? freshData : (previous && previous.wired ? previous.data : null);
  const state = computeSourceState(lastUpdatedIso, {
    now,
    staleAfterMinutes: thresholds.staleAfterMinutes,
    offlineAfterMinutes: thresholds.offlineAfterMinutes,
  });
  return { wired: true, state, lastUpdatedIso, fetchOk, data, note: null };
}

export function buildNotWiredSource(note) {
  return { wired: false, state: 'not-wired', lastUpdatedIso: null, fetchOk: false, data: null, note };
}

/**
 * Overall system state: worst-of across every *critical* source only.
 * `content`/`image`/`affiliate` are excluded — a not-wired Phase 3 source
 * can never drag the headline down, and once wired their own staleness will
 * count the same way engineering/deployment already do.
 */
export function aggregateOverallState(sources) {
  const states = CRITICAL_SOURCES.map((name) => sources[name].state);
  if (states.includes('offline')) return 'offline';
  if (states.includes('delayed')) return 'delayed';
  return 'live';
}

/**
 * Lightweight stalled-handoff signal for the dashboard (issue #42's
 * "detect stalled automation and missing branch-to-PR handoffs"). Unlike
 * the full watchdog (scripts/handoff-watchdog-rules.mjs), this doesn't
 * fetch branch/commit data of its own — it reuses the same
 * GRACE_PERIOD_MINUTES constant against data the engineering source already
 * gathered (active issue + whether a PR exists), which is enough to *show*
 * a stall without duplicating the watchdog's own repair/escalate logic.
 */
export function detectStalledHandoff({ automationState, activeIssue, pr, now }) {
  if (automationState !== 'working' || !activeIssue || pr) {
    return { stalled: false, reason: null };
  }
  const elapsedMinutes = minutesBetween(activeIssue.updatedIso, now);
  if (elapsedMinutes < GRACE_PERIOD_MINUTES) {
    return { stalled: false, reason: null };
  }
  return {
    stalled: true,
    reason: `#${activeIssue.number} has been "in-progress" for ${Math.round(elapsedMinutes)}m with no linked PR (grace period is ${GRACE_PERIOD_MINUTES}m).`,
  };
}

// The queue dispatcher runs hourly. Allow one missed cycle plus scheduling
// jitter before an undispatched ready queue becomes an operational alert.
export const DISPATCH_SLA_MINUTES = 90;

export function computeDispatchStalledSince({ automationState, readyCount, previousSinceIso, now }) {
  if (automationState !== 'queued' || readyCount <= 0) return null;
  return previousSinceIso || now;
}

export function detectStalledDispatch({ automationState, readyCount, dispatchStalledSinceIso, now }) {
  if (automationState !== 'queued' || readyCount <= 0 || !dispatchStalledSinceIso) {
    return { stalled: false, reason: null };
  }
  const elapsedMinutes = minutesBetween(dispatchStalledSinceIso, now);
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < DISPATCH_SLA_MINUTES) {
    return { stalled: false, reason: null };
  }
  return {
    stalled: true,
    reason: `${readyCount} issue(s) ready and undispatched for ${Math.round(elapsedMinutes)}m (SLA is ${DISPATCH_SLA_MINUTES}m) — check the Automation Queue Dispatcher workflow.`,
  };
}

/**
 * CEO summary card content (issue #42's "system health, required action,
 * active work, blockers" in one glance). Precedence: a source being offline
 * is more urgent than anything it might otherwise report, since an offline
 * source means we genuinely don't know the current state.
 */
export function buildCeoSummary({ overallState, engineering, deployment }) {
  const eng = engineering.data;
  const dep = deployment.data;

  if (engineering.state === 'offline') {
    return {
      headline: 'Live engineering data is unavailable.',
      requiredAction: 'GitHub API calls for issues/PRs/CI are failing or the generator has not run in a long time — check the ops-live-feed-refresh workflow.',
      activeWorkSummary: null,
    };
  }
  if (deployment.state === 'offline') {
    return {
      headline: 'Live deployment data is unavailable.',
      requiredAction: 'GitHub API calls for the Pages deployment are failing or the generator has not run in a long time — check the ops-live-feed-refresh workflow.',
      activeWorkSummary: eng ? activeWorkSummaryText(eng) : null,
    };
  }
  if (
    eng
    && eng.automationState === 'idle'
    && eng.queue.labeledReadyCount > 0
    && eng.queue.eligibleReadyCount === 0
  ) {
    const first = eng.queue.rejections[0];
    return {
      headline: 'Ready-labeled work is not dispatchable.',
      requiredAction: first
        ? `Fix issue #${first.issueNumber}: ${first.reasons.join('; ')}`
        : 'Run the issue-contract lint and repair the rejected ready issue.',
      activeWorkSummary: 'No eligible issue can enter the engineering queue.',
    };
  }
  if (eng && eng.handoff.stalled) {
    return {
      headline: eng.automationState === 'queued' ? 'Queued work is not being dispatched.' : 'A completed run looks stalled.',
      requiredAction: eng.handoff.reason,
      activeWorkSummary: activeWorkSummaryText(eng),
    };
  }
  if (eng && (eng.automationState === 'blocked' || eng.automationState === 'failed')) {
    return {
      headline: `Issue #${eng.activeIssue.number} is ${eng.automationState} and needs a human.`,
      requiredAction: `Review #${eng.activeIssue.number} — "${eng.activeIssue.title}".`,
      activeWorkSummary: activeWorkSummaryText(eng),
    };
  }
  if (dep && dep.status === 'failing') {
    return {
      headline: 'The latest deployment is failing health checks.',
      requiredAction: 'Check the deploy-health-check workflow run and the last-known-healthy build.',
      activeWorkSummary: eng ? activeWorkSummaryText(eng) : null,
    };
  }
  if (eng && eng.ci.status === 'failing') {
    return {
      headline: 'CI is failing.',
      requiredAction: `Check the latest CI run: ${eng.ci.latestRunUrl || '(no run URL available)'}`,
      activeWorkSummary: activeWorkSummaryText(eng),
    };
  }
  if (overallState === 'delayed') {
    return {
      headline: 'Everything looks fine, but data is delayed.',
      requiredAction: 'The live feed generator has not refreshed recently — treat the detail below as informational until it catches up.',
      activeWorkSummary: eng ? activeWorkSummaryText(eng) : null,
    };
  }
  return {
    headline: 'Everything is healthy — no action needed.',
    requiredAction: null,
    activeWorkSummary: eng ? activeWorkSummaryText(eng) : null,
  };
}

function activeWorkSummaryText(eng) {
  if (!eng.activeIssue) {
    if (eng.queue.eligibleReadyCount > 0) {
      return `${eng.queue.eligibleReadyCount} eligible issue(s) queued, none active.`;
    }
    if (eng.queue.labeledReadyCount > 0) {
      return `${eng.queue.labeledReadyCount} ready-labeled issue(s), none eligible.`;
    }
    return 'No active automation work.';
  }
  const prPart = eng.pr ? ` (PR #${eng.pr.number}${eng.pr.isDraft ? ', draft' : ''})` : ' (no PR yet)';
  return `#${eng.activeIssue.number} "${truncate(eng.activeIssue.title, 80)}"${prPart}`;
}

/**
 * Merges this run's candidate feed events with the previous run's committed
 * feed by stable `key`, so the same underlying event (a CI run, a merged
 * PR, a deploy) only ever appears once no matter how many generator runs
 * observe it — idempotent by construction rather than by diffing old vs.
 * new state. Sorted newest-first, capped to MAX_AUTOMATION_FEED_EVENTS.
 */
export function mergeAutomationFeed(previousEvents, candidateEvents, { maxEvents = MAX_AUTOMATION_FEED_EVENTS } = {}) {
  const byKey = new Map();
  for (const e of previousEvents || []) {
    if (e && isNonEmptyString(e.key)) byKey.set(e.key, e);
  }
  for (const e of candidateEvents || []) {
    if (e && isNonEmptyString(e.key) && !byKey.has(e.key)) byKey.set(e.key, e);
  }
  return [...byKey.values()]
    .sort((a, b) => new Date(b.timestampIso).getTime() - new Date(a.timestampIso).getTime())
    .slice(0, maxEvents);
}

/** Turns automation/status/events.jsonl entries into feed candidates. */
export function feedEventsFromStatusLog(statusEvents) {
  return (statusEvents || []).map((e) => ({
    key: `log:${e.timestampIso}:${e.type}`,
    timestampIso: e.timestampIso,
    type: e.type,
    summary: truncate(e.summary, 160),
    url: null,
  }));
}

/** Turns this run's engineering/deployment observations into feed candidates. */
export function feedEventsFromGitHubState({ activeIssue, pr, ciRuns, mergedPrs, deployment, repoUrl }) {
  const events = [];

  if (activeIssue) {
    events.push({
      key: `issue-started:${activeIssue.number}`,
      timestampIso: activeIssue.updatedIso,
      type: 'issue-started',
      summary: `Issue #${activeIssue.number} "${truncate(activeIssue.title, 100)}" started.`,
      url: activeIssue.url || null,
    });
  }

  if (pr) {
    events.push({
      key: `pr-opened:${pr.number}`,
      timestampIso: pr.createdIso || pr.updatedIso,
      type: 'pr-opened',
      summary: `PR #${pr.number} "${truncate(pr.title, 100)}" opened${pr.isDraft ? ' (draft)' : ''}.`,
      url: pr.url || null,
    });
  }

  for (const run of ciRuns || []) {
    if (!run.conclusion) continue; // still in progress — not a completed event yet
    events.push({
      key: `ci-run:${run.id}`,
      timestampIso: run.updatedIso,
      type: run.conclusion === 'success' ? 'ci-passed' : 'ci-failed',
      summary: `${run.name || 'Workflow'} ${run.conclusion === 'success' ? 'passed' : 'failed'} on ${run.headBranch || 'a branch'}.`,
      url: run.htmlUrl || null,
    });
  }

  for (const pr2 of mergedPrs || []) {
    events.push({
      key: `pr-merged:${pr2.number}`,
      timestampIso: pr2.mergedIso,
      type: 'pr-merged',
      summary: `PR #${pr2.number} "${truncate(pr2.title, 100)}" merged.`,
      url: pr2.url || null,
    });
  }

  if (deployment && deployment.lastDeployIso) {
    events.push({
      key: `deploy:${deployment.lastHealthyShaShort || deployment.lastDeployIso}`,
      timestampIso: deployment.lastDeployIso,
      type: deployment.status === 'healthy' ? 'deployed' : 'deploy-failed',
      summary:
        deployment.status === 'healthy'
          ? `Deployed build ${deployment.lastHealthyShaShort || '(unknown sha)'} — health checks passed.`
          : 'Deployment failed its health checks.',
      url: repoUrl ? `${repoUrl}/deployments` : null,
    });
  }

  return events;
}

/**
 * Assembles the full `ops/live-feed.json` document. `sources` fields mirror
 * scripts/ops-status-cli.mjs's degrade-gracefully-on-missing-input shape:
 *   - engineering: { fetchOk, data } | null when GITHUB_TOKEN isn't set at all
 *   - deployment: { fetchOk, data } | null likewise
 *   - previousDoc: the last committed ops/live-feed.json, or null
 *   - statusEvents: array from scripts/record-status-event.mjs `readEvents()`
 *   - feedCandidates: extra candidate events already shaped by
 *     feedEventsFromGitHubState (kept separate from `engineering`/
 *     `deployment` above since the feed needs the *raw* GitHub lists —
 *     ci runs, merged PRs — that don't belong in the compact source `data`)
 */
export function buildLiveFeed(sources = {}, { now } = {}) {
  const nowIso = now || new Date().toISOString();
  const {
    engineering = null,
    deployment = null,
    previousDoc = null,
    statusEvents = [],
    feedCandidates = [],
  } = sources;

  const previousSources = previousDoc && previousDoc.sources ? previousDoc.sources : {};

  const engineeringSource = buildSource({
    name: 'engineering',
    fetchOk: !!(engineering && engineering.fetchOk),
    freshData: engineering ? engineering.data : null,
    previous: previousSources.engineering || null,
    now: nowIso,
    thresholds: DEFAULT_THRESHOLDS.engineering,
  });

  const deploymentSource = buildSource({
    name: 'deployment',
    fetchOk: !!(deployment && deployment.fetchOk),
    freshData: deployment ? deployment.data : null,
    previous: previousSources.deployment || null,
    now: nowIso,
    thresholds: DEFAULT_THRESHOLDS.deployment,
  });

  const sourcesOut = {
    engineering: engineeringSource,
    deployment: deploymentSource,
    content: buildNotWiredSource('Guide Factory stage/queue integration ships in Phase 3 (issue #42).'),
    image: buildNotWiredSource('Image renderer spend/render integration ships in Phase 3 (issue #42).'),
    affiliate: buildNotWiredSource('Link-engine coverage integration ships in Phase 3 (issue #42).'),
  };

  const overallState = aggregateOverallState(sourcesOut);
  const ceo = buildCeoSummary({ overallState, engineering: engineeringSource, deployment: deploymentSource });

  const previousFeed = (previousDoc && Array.isArray(previousDoc.automationFeed)) ? previousDoc.automationFeed : [];
  const candidates = [...feedEventsFromStatusLog(statusEvents), ...feedCandidates];
  const automationFeed = mergeAutomationFeed(previousFeed, candidates);

  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    generatedAtIso: nowIso,
    overallState,
    ceo,
    sources: sourcesOut,
    automationFeed,
  };
}
