#!/usr/bin/env node
// Thin fs/network-writing CLI around scripts/ops-live-builder.mjs — the only
// file that touches disk or the network for Mission Control v2's live-data
// document (issue #42). Reads the last committed `ops/live-feed.json` (for
// last-known-good fallback), the local status-log, and (when
// GITHUB_TOKEN/GITHUB_REPOSITORY are set) live GitHub engineering and
// deployment state, then writes the sanitized document — refusing to write
// anything that fails schema validation or the shared secret scanner,
// exactly like scripts/ops-status-cli.mjs.
//
// Usage:
//   node scripts/ops-live-cli.mjs [--dry-run] [--now <iso>]
//
// GITHUB_TOKEN + GITHUB_REPOSITORY are optional: without them, both
// critical sources report fetchOk: false and degrade to their prior
// last-known-good state (or `offline` on a first-ever run) — see
// docs/OPS_DASHBOARD_V2.md "Local / unauthenticated runs".
//
// Canonical spec: docs/OPS_DASHBOARD_V2.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEvents } from './record-status-event.mjs';
import {
  buildLiveFeed,
  computeDispatchStalledSince,
  detectStalledDispatch,
  detectStalledHandoff,
  feedEventsFromGitHubState,
} from './ops-live-builder.mjs';
import { validateLiveFeedShape, findSecretLikeValues } from './ops-live-schema.mjs';
import { deriveAutomationState, truncateSummary } from './ops-status-builder.mjs';
import { clientFromEnv, repoFromEnv } from './queue-github-client.mjs';
import { INCIDENT_LABEL } from './queue-rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CI_WORKFLOW_FILE = 'content-validation.yml';
const MAIN_BRANCH = 'main';
export const LIVE_FEED_OUTPUT_PATH = path.join(ROOT, 'ops', 'live-feed.json');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--now') {
      args.now = argv[i + 1];
      i++;
    }
  }
  return args;
}

function loadPreviousDoc() {
  if (!existsSync(LIVE_FEED_OUTPUT_PATH)) return null;
  try {
    const doc = JSON.parse(readFileSync(LIVE_FEED_OUTPUT_PATH, 'utf8'));
    const queue = doc?.sources?.engineering?.data?.queue;
    // Schema v1 feeds written before the dispatch watchdog shipped do not
    // have this clock. Normalize them in memory so the first new generator
    // run can carry the last-known-good payload forward and upgrade it.
    if (queue && !Object.hasOwn(queue, 'stalledSinceIso')) {
      queue.stalledSinceIso = null;
    }
    return doc;
  } catch {
    return null; // corrupt/partial file — treat as a first-ever run rather than crash
  }
}

function shortSha(sha) {
  return typeof sha === 'string' && sha.length > 0 ? sha.slice(0, 7) : null;
}

function mapPr(pr, reviewDecision) {
  if (!pr) return null;
  return {
    number: pr.number,
    title: truncateSummary(pr.title, 120),
    url: pr.html_url || null,
    isDraft: !!pr.draft,
    reviewDecision: reviewDecision || null,
    mergeableState: pr.mergeable_state || null,
    createdIso: pr.created_at || null,
    updatedIso: pr.updated_at || null,
  };
}

/**
 * Gathers engineering state: active issue, queue depth, the linked PR (with
 * review decision), CI status, and a lightweight stalled-handoff check.
 * Returns `{ fetchOk: false }` (never throws) on any failure so the caller
 * degrades to last-known-good rather than crashing the whole run.
 */
async function loadEngineeringState(client, nowIso, previousDispatchStalledSinceIso) {
  try {
    const [inProgressIssues, readyIssues, blockedIssues, automationManagedPrs, ciRuns] = await Promise.all([
      client.listOpenIssuesWithLabel('in-progress'),
      client.listOpenIssuesWithLabel('ready'),
      client.listOpenIssuesWithLabel('blocked'),
      client.listOpenPullRequestsWithLabel('automation-managed'),
      client.listWorkflowRunsForBranch(MAIN_BRANCH, CI_WORKFLOW_FILE),
    ]);

    const activeIssueRaw = inProgressIssues[0] || null;
    const activeIssue = activeIssueRaw
      ? { number: activeIssueRaw.number, title: truncateSummary(activeIssueRaw.title, 120), url: activeIssueRaw.html_url || null, updatedIso: activeIssueRaw.updated_at || nowIso }
      : null;

    const prRaw = activeIssueRaw
      ? automationManagedPrs.find((p) => new RegExp(`[Cc]loses #${activeIssueRaw.number}\\b`).test(p.body || '')) || null
      : automationManagedPrs[0] || null;
    let reviewDecision = null;
    if (prRaw) {
      try {
        reviewDecision = await client.getPullRequestReviewDecision(prRaw.number);
      } catch {
        reviewDecision = null;
      }
    }
    const pr = mapPr(prRaw, reviewDecision);

    const latestCiRun = ciRuns[0] || null;
    const ci = {
      status: latestCiRun && latestCiRun.conclusion ? (latestCiRun.conclusion === 'success' ? 'passing' : 'failing') : 'unknown',
      latestRunIso: latestCiRun ? latestCiRun.updated_at || null : null,
      latestRunUrl: latestCiRun ? latestCiRun.html_url || null : null,
      recentFailureCount: ciRuns.filter((r) => r.conclusion && r.conclusion !== 'success').length,
    };

    const automationState = prRaw ? 'review' : deriveAutomationState(activeIssueRaw, { readyCount: readyIssues.length });
    const stalledSinceIso = computeDispatchStalledSince({
      automationState,
      readyCount: readyIssues.length,
      previousSinceIso: previousDispatchStalledSinceIso,
      now: nowIso,
    });
    const handoffResult = detectStalledHandoff({ automationState, activeIssue, pr, now: nowIso });
    const dispatchResult = detectStalledDispatch({
      automationState,
      readyCount: readyIssues.length,
      dispatchStalledSinceIso: stalledSinceIso,
      now: nowIso,
    });
    const handoff = handoffResult.stalled ? handoffResult : dispatchResult;

    const data = {
      automationState,
      activeIssue,
      queue: { depth: readyIssues.length, readyCount: readyIssues.length, blockedCount: blockedIssues.length, stalledSinceIso },
      pr,
      ci,
      handoff,
    };

    return { fetchOk: true, data, ciRuns, activeIssueRaw };
  } catch (err) {
    console.error(`Engineering state fetch failed: ${err.message}`);
    return { fetchOk: false };
  }
}

/** Gathers GitHub Pages deployment state. Never throws — see getLatestPagesDeployment's own contract. */
async function loadDeploymentState(client, nowIso) {
  const deployment = await client.getLatestPagesDeployment();
  if (!deployment) return { fetchOk: false };
  const status = deployment.state === 'success' ? 'healthy' : deployment.state ? 'failing' : 'unknown';
  const ageMinutes = deployment.updatedIso ? Math.max(0, (new Date(nowIso).getTime() - new Date(deployment.updatedIso).getTime()) / 60000) : null;
  return {
    fetchOk: true,
    data: {
      status,
      lastHealthyShaShort: status === 'healthy' ? shortSha(deployment.sha) : null,
      lastDeployIso: deployment.updatedIso || null,
      ageMinutes: ageMinutes === null ? null : Math.round(ageMinutes),
      pagesUrl: deployment.environmentUrl || null,
    },
  };
}

export async function generateLiveFeed({ now } = {}) {
  const nowIso = now || new Date().toISOString();
  const previousDoc = loadPreviousDoc();
  const statusEvents = readEvents({});

  let client;
  try {
    client = clientFromEnv();
  } catch {
    console.error('GITHUB_TOKEN/GITHUB_REPOSITORY not set — engineering and deployment sources will degrade to last-known-good.');
    return buildLiveFeed({ engineering: null, deployment: null, previousDoc, statusEvents, feedCandidates: [] }, { now: nowIso });
  }

  const previousDispatchStalledSinceIso = previousDoc?.sources?.engineering?.data?.queue?.stalledSinceIso || null;

  const [engineering, deployment] = await Promise.all([
    loadEngineeringState(client, nowIso, previousDispatchStalledSinceIso),
    loadDeploymentState(client, nowIso),
  ]);

  let mergedPrs = [];
  try {
    const raw = await client.listRecentlyMergedPullRequests({ limit: 20 });
    mergedPrs = raw.map((pr) => ({ number: pr.number, title: truncateSummary(pr.title, 120), url: pr.html_url || null, mergedIso: pr.merged_at }));
  } catch {
    mergedPrs = [];
  }

  let repoUrl = null;
  try {
    const { owner, name } = repoFromEnv();
    repoUrl = `https://github.com/${owner}/${name}`;
  } catch {
    repoUrl = null;
  }

  const feedCandidates = feedEventsFromGitHubState({
    activeIssue: engineering.fetchOk ? engineering.data.activeIssue : null,
    pr: engineering.fetchOk ? engineering.data.pr : null,
    ciRuns: engineering.fetchOk
      ? (engineering.ciRuns || []).map((r) => ({ id: r.id, name: r.name, conclusion: r.conclusion, headBranch: r.head_branch, updatedIso: r.updated_at, htmlUrl: r.html_url }))
      : [],
    mergedPrs,
    deployment: deployment.fetchOk ? deployment.data : null,
    repoUrl,
  });

  return buildLiveFeed(
    {
      engineering: { fetchOk: engineering.fetchOk, data: engineering.fetchOk ? engineering.data : null },
      deployment,
      previousDoc,
      statusEvents,
      feedCandidates,
    },
    { now: nowIso }
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const liveFeed = await generateLiveFeed({ now: args.now });

  const shapeCheck = validateLiveFeedShape(liveFeed);
  if (!shapeCheck.valid) {
    console.error('Refusing to write ops/live-feed.json — schema validation failed:');
    shapeCheck.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const secretFindings = findSecretLikeValues(liveFeed);
  if (secretFindings.length) {
    console.error('Refusing to write ops/live-feed.json — secret-like value(s) detected:');
    secretFindings.forEach((f) => console.error(`  - ${f.path}: ${f.reason}`));
    process.exit(1);
  }

  console.log(JSON.stringify(liveFeed, null, 2));

  if (!args.dryRun) {
    mkdirSync(path.dirname(LIVE_FEED_OUTPUT_PATH), { recursive: true });
    writeFileSync(LIVE_FEED_OUTPUT_PATH, `${JSON.stringify(liveFeed, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${path.relative(ROOT, LIVE_FEED_OUTPUT_PATH)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
