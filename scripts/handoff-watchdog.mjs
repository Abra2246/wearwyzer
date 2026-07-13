#!/usr/bin/env node
// Automation completion handoff watchdog (issue #22). Dependency-free Node
// ESM. Detects an automation-managed issue that is still labeled
// `in-progress` after its implementation branch has gone quiet with no PR
// opened, and repairs it automatically (opens a draft PR, moves the issue
// to `review`) or escalates to a human — reproducing and preventing the
// exact silent-handoff failure seen on issues #16 and #17.
//
// Usage:
//   node scripts/handoff-watchdog.mjs [--dry-run] [--now <iso>]
//
// Requires GITHUB_TOKEN + GITHUB_REPOSITORY in the environment. No new
// secret — this uses the workflow's own GITHUB_TOKEN.
//
// See docs/AUTOMATION_HANDOFF_WATCHDOG_V1.md for the full contract and
// docs/AUTOMATION_WORKFLOW.md for how this is wired into a scheduled
// workflow.

import { clientFromEnv } from './queue-github-client.mjs';
import { hasLabel, getRiskTier } from './queue-rules.mjs';
import {
  planWatchdogAction,
  selectMostRecentBranch,
  branchPrefixForIssue,
  GRACE_PERIOD_MINUTES,
  MARKERS,
} from './handoff-watchdog-rules.mjs';
import { buildStatusEvent } from './status-log.mjs';
import { appendEvent } from './record-status-event.mjs';

export const BASE_BRANCH = 'main';
export const CLAUDE_WORKFLOW_FILE = 'claude.yml';

export function buildDraftPrTitle(issue) {
  return `Automated repair PR for #${issue.number}: ${issue.title}`;
}

export function buildDraftPrBody(issue) {
  return [
    'Automatically opened by the automation completion handoff watchdog because implementation on ' +
      'this branch appeared complete but no PR had been opened within the grace period.',
    '',
    `Closes #${issue.number}`,
    '',
    '**This is a draft PR opened for repair, not a merge decision.** Review it exactly as any other ' +
      "automation-managed PR — see the linked issue for scope, risk tier, and acceptance criteria.",
    '',
    MARKERS.draftPrOpened,
  ].join('\n');
}

export function buildStagedWorkflowComment({ prNumber, files }) {
  const fileList = files.map((f) => `- \`${f}\``).join('\n');
  return [
    `This branch${prNumber ? ` (PR #${prNumber})` : ''} adds staged workflow file(s) under ` +
      '`docs/automation/workflows/` that require a maintainer with `.github/workflows/` edit access to ' +
      "promote — Claude's GitHub App token cannot write to that directory (see `docs/AUTOMATION_WORKFLOW.md`).",
    '',
    '**Files requiring promotion:**',
    fileList,
    '',
    'Copy each file into `.github/workflows/` (same filename) once its contents are reviewed. This task ' +
      'is separate from the PR review itself — resolve it whenever the PR merges or sooner.',
    '',
    MARKERS.stagedWorkflowFlagged,
  ].join('\n');
}

export function buildNoBranchEscalationComment(issue) {
  return [
    'Automation could not find a usable implementation branch or open PR for this issue after its ' +
      'grace period elapsed.',
    '',
    '**Reason:** completed run has neither a usable branch (expected prefix ' +
      `\`${branchPrefixForIssue(issue.number)}\`) nor an open PR referencing this issue.`,
    '',
    MARKERS.escalatedNoBranch,
  ].join('\n');
}

async function resolveBranch(client, issueNumber) {
  const prefix = branchPrefixForIssue(issueNumber);
  const refs = await client.listMatchingBranchRefs(prefix);
  if (refs.length === 0) return null;
  const withCommitDates = await Promise.all(
    refs.map(async (ref) => ({ name: ref.name, lastCommitIso: await client.getBranchLastCommitIso(ref.name) }))
  );
  return selectMostRecentBranch(withCommitDates);
}

function buildStatusDetail({ issue, branch, linkedPrs, plan, workflowRun }) {
  return {
    issueNumber: issue.number,
    branch: branch ? branch.name : null,
    lastActivityAt: branch ? branch.lastCommitIso : null,
    prNumber: linkedPrs && linkedPrs.length > 0 ? linkedPrs[0].number : null,
    workflowRun: workflowRun
      ? { id: workflowRun.id, url: workflowRun.html_url, conclusion: workflowRun.conclusion }
      : null,
    step: plan.type,
  };
}

/** Evaluate and, unless `dryRun`, act on a single automation-managed
 * in-progress issue. Returns `{ issueNumber, type, reason?, events }`. */
export async function evaluateIssue(client, issue, { nowIso, dryRun = false, gracePeriodMinutes = GRACE_PERIOD_MINUTES }) {
  const events = [];
  const branch = await resolveBranch(client, issue.number);
  const [issueComments, linkedPrs] = await Promise.all([
    client.listIssueComments(issue.number),
    branch ? client.listOpenPullRequestsForBranch(branch.name) : Promise.resolve([]),
  ]);
  const changedFiles =
    branch && linkedPrs.length === 0
      ? await client.compareCommits(BASE_BRANCH, branch.name).catch(() => [])
      : branch
        ? await client.listChangedFiles(linkedPrs[0].number).catch(() => [])
        : [];

  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs,
    changedFiles,
    issueComments,
    nowIso,
    gracePeriodMinutes,
  });

  const workflowRun = branch
    ? (await client.listWorkflowRunsForBranch(branch.name, CLAUDE_WORKFLOW_FILE))[0]
    : undefined;
  const detail = buildStatusDetail({ issue, branch, linkedPrs, plan, workflowRun });

  if (plan.type === 'escalate-no-branch') {
    console.log(`${dryRun ? '[dry-run] ' : ''}Issue #${issue.number}: escalating — no usable branch or PR`);
    if (!dryRun) {
      await client.removeLabel(issue.number, 'in-progress');
      await client.addLabels(issue.number, ['automation-failed', 'needs-human']);
      await client.createComment(issue.number, buildNoBranchEscalationComment(issue));
    }
    events.push(
      buildStatusEvent({
        timestampIso: nowIso,
        kind: 'exception',
        type: 'automation-blocked-after-retries',
        summary: `Issue #${issue.number}: no usable branch or PR after grace period — escalated to needs-human`,
        detail: JSON.stringify(detail),
      })
    );
  } else if (plan.type === 'repair') {
    let prNumber = linkedPrs[0] ? linkedPrs[0].number : null;

    if (plan.openDraftPr) {
      console.log(`${dryRun ? '[dry-run] ' : ''}Issue #${issue.number}: opening draft PR from ${plan.branch.name}`);
      if (!dryRun) {
        const pr = await client.createPullRequest({
          title: buildDraftPrTitle(issue),
          head: plan.branch.name,
          base: BASE_BRANCH,
          body: buildDraftPrBody(issue),
          draft: true,
        });
        prNumber = pr.number;
        const riskTier = getRiskTier(issue.labels);
        const prLabels = ['automation-managed', ...(riskTier ? [`risk-${riskTier}`] : [])];
        await client.addLabels(prNumber, prLabels);
        await client.removeLabel(issue.number, 'in-progress');
        await client.addLabels(issue.number, ['review']);
        await client.createComment(
          issue.number,
          `Automation opened draft PR #${prNumber} from branch \`${plan.branch.name}\` after the grace ` +
            `period elapsed with no PR present. Moving this issue from \`in-progress\` to \`review\`.\n\n` +
            MARKERS.draftPrOpened
        );
      }
      detail.prNumber = prNumber;
      events.push(
        buildStatusEvent({
          timestampIso: nowIso,
          kind: 'routine',
          type: 'handoff-draft-pr-opened',
          summary: `Issue #${issue.number}: repaired silent handoff by opening draft PR #${prNumber ?? '(dry-run)'}`,
          detail: JSON.stringify(detail),
        })
      );
    }

    if (plan.flagStagedWorkflow) {
      console.log(
        `${dryRun ? '[dry-run] ' : ''}Issue #${issue.number}: flagging ${plan.stagedFiles.length} staged workflow file(s)`
      );
      if (!dryRun) {
        await client.addLabels(issue.number, ['needs-human']);
        await client.createComment(
          issue.number,
          buildStagedWorkflowComment({ prNumber, files: plan.stagedFiles })
        );
      }
      events.push(
        buildStatusEvent({
          timestampIso: nowIso,
          kind: 'exception',
          type: 'staged-workflow-needs-promotion',
          summary: `Issue #${issue.number}: ${plan.stagedFiles.length} staged workflow file(s) need maintainer promotion`,
          detail: JSON.stringify({ ...detail, stagedFiles: plan.stagedFiles }),
        })
      );
    }
  } else if (plan.type === 'pending') {
    events.push(
      buildStatusEvent({
        timestampIso: nowIso,
        kind: 'routine',
        type: 'handoff-pending',
        summary: `Issue #${issue.number}: ${plan.reason}`,
        detail: JSON.stringify(detail),
      })
    );
  } else {
    events.push(
      buildStatusEvent({
        timestampIso: nowIso,
        kind: 'routine',
        type: 'handoff-noop',
        summary: `Issue #${issue.number}: ${plan.reason}`,
        detail: JSON.stringify(detail),
      })
    );
  }

  return { issueNumber: issue.number, ...plan, events };
}

export async function runWatchdog(
  client,
  { dryRun = false, nowIso, gracePeriodMinutes = GRACE_PERIOD_MINUTES, appendEventFn = appendEvent } = {}
) {
  if (!nowIso) throw new Error('runWatchdog requires nowIso (no internal Date.now() in this codebase — see repo convention)');

  const inProgressIssues = await client.listOpenIssuesWithLabel('in-progress');
  const automationManaged = inProgressIssues.filter((issue) => hasLabel(issue.labels, 'automation-managed'));

  const results = [];
  const allEvents = [];
  for (const issue of automationManaged) {
    try {
      const result = await evaluateIssue(client, issue, { nowIso, dryRun, gracePeriodMinutes });
      allEvents.push(...result.events);
      results.push(result);
    } catch (err) {
      const event = buildStatusEvent({
        timestampIso: nowIso,
        kind: 'exception',
        type: 'automation-blocked-after-retries',
        summary: `Issue #${issue.number}: handoff watchdog failed evaluating this issue`,
        detail: JSON.stringify({ issueNumber: issue.number, error: err.message }),
      });
      allEvents.push(event);
      results.push({ issueNumber: issue.number, type: 'error', reason: err.message, events: [event] });
    }
  }

  if (!dryRun) {
    for (const event of allEvents) appendEventFn(event);
  }

  return { results, events: allEvents };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const nowFlagIdx = process.argv.indexOf('--now');
  const nowIso = nowFlagIdx !== -1 ? process.argv[nowFlagIdx + 1] : new Date().toISOString();
  const client = clientFromEnv();
  const { results } = await runWatchdog(client, { dryRun, nowIso, gracePeriodMinutes: GRACE_PERIOD_MINUTES });
  for (const r of results) {
    console.log(`Issue #${r.issueNumber}: ${r.type}${r.reason ? ` — ${r.reason}` : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
