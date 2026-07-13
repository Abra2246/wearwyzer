// Pure, dependency-free rule functions for the automation completion
// handoff watchdog (issue #22). No I/O in this file — every function takes
// plain data in and returns plain data out, matching the pattern in
// scripts/queue-rules.mjs. scripts/handoff-watchdog.mjs is the only file
// that calls the GitHub API; it hands the results through these functions
// to decide what to do.
//
// Problem this exists to fix: on issues #16 and #17, Claude's
// implementation completed and pushed a branch, but the completion comment
// only linked a "create a PR" URL rather than opening one — so the issue
// stayed labeled `in-progress` for hours until a maintainer manually opened
// the PR (and, for #17, promoted the staged workflow files it added). This
// module is the decision logic for detecting and repairing exactly that
// failure mode.
//
// Canonical spec: docs/AUTOMATION_HANDOFF_WATCHDOG_V1.md

import { hasLabel } from './queue-rules.mjs';

export const GRACE_PERIOD_MINUTES = 15;
export const BRANCH_PREFIX = 'claude/issue-';
export const STAGED_WORKFLOW_PATH_PREFIX = 'docs/automation/workflows/';

// Idempotency markers: an HTML comment embedded in a posted comment body so
// a later watchdog pass can tell "already did this" from "haven't yet" —
// GitHub gives no other durable place to record this without a new secret
// or storage dependency (see docs/AUTOMATION_HANDOFF_WATCHDOG_V1.md).
export const MARKERS = Object.freeze({
  draftPrOpened: '<!-- handoff-watchdog:draft-pr-opened -->',
  stagedWorkflowFlagged: '<!-- handoff-watchdog:staged-workflow-flagged -->',
  escalatedNoBranch: '<!-- handoff-watchdog:escalated-no-branch -->',
});

/** Branch-name prefix Claude's own implementation workflow uses for a given
 * issue (e.g. the real `claude/issue-16-20260713-0156`,
 * `claude/issue-17-20260713-0336` branches this repo already has). */
export function branchPrefixForIssue(issueNumber) {
  return `${BRANCH_PREFIX}${issueNumber}-`;
}

/** Pick the most recently active of a set of candidate branches (there
 * should only ever be one per issue in practice, but a retried/duplicate
 * trigger could push a second branch for the same issue). */
export function selectMostRecentBranch(branches) {
  if (!branches || branches.length === 0) return null;
  return [...branches].sort(
    (a, b) => new Date(b.lastCommitIso).getTime() - new Date(a.lastCommitIso).getTime()
  )[0];
}

/** Minutes elapsed from `fromIso` to `toIso`. Both timestamps always come
 * from the caller — never generated in here — so this stays a pure,
 * replayable function (repo-wide rule: no Date.now() inside pure logic). */
export function minutesBetween(fromIso, toIso) {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000;
}

export function detectStagedWorkflowFiles(changedFiles) {
  return (changedFiles || []).filter((f) => f.startsWith(STAGED_WORKFLOW_PATH_PREFIX));
}

export function hasMarker(comments, marker) {
  return (comments || []).some((c) => (c.body || '').includes(marker));
}

/**
 * Core decision function for one automation-managed issue. `branch` is
 * `{ name, lastCommitIso } | null` — the caller already resolved this via
 * the GitHub API. Returns exactly one of:
 *
 *  - `noop`               — nothing to do: not automation-managed/
 *                            in-progress, a PR already exists with nothing
 *                            left to flag, or a prior pass already handled
 *                            everything (see the marker checks — every
 *                            action here is idempotent across repeated
 *                            scheduled runs).
 *  - `pending`             — a branch exists but is still within the grace
 *                            period and has no staged workflow files to
 *                            flag yet; nothing to do this pass.
 *  - `escalate-no-branch`  — the run completed with neither a usable
 *                            branch nor an open PR; mark
 *                            `automation-failed` + `needs-human`.
 *  - `repair`              — contains `openDraftPr` and/or
 *                            `flagStagedWorkflow` booleans (both can be
 *                            true in the same pass) for the caller to act
 *                            on.
 *
 * Staged-workflow flagging is intentionally independent of the grace-period
 * timer and of whether a PR already exists: those files need a maintainer's
 * attention regardless of how "done" the rest of the branch looks, and
 * waiting on them silently is exactly the issue #17 failure mode.
 */
export function planWatchdogAction({
  issue,
  branch,
  linkedPrs = [],
  changedFiles = [],
  issueComments = [],
  nowIso,
  gracePeriodMinutes = GRACE_PERIOD_MINUTES,
}) {
  const labels = issue.labels || [];
  if (!hasLabel(labels, 'automation-managed')) {
    return { type: 'noop', reason: 'issue is not automation-managed' };
  }
  if (!hasLabel(labels, 'in-progress')) {
    return { type: 'noop', reason: 'issue is not in-progress — nothing to watch' };
  }

  if (!branch) {
    if (linkedPrs.length > 0) {
      return { type: 'noop', reason: `PR #${linkedPrs[0].number} already exists for this issue` };
    }
    if (hasMarker(issueComments, MARKERS.escalatedNoBranch)) {
      return { type: 'noop', reason: 'already escalated: no usable branch or PR' };
    }
    return {
      type: 'escalate-no-branch',
      reason: 'completed run has neither a usable branch nor an open PR',
    };
  }

  const elapsedMinutes = minutesBetween(branch.lastCommitIso, nowIso);
  const withinGrace = elapsedMinutes < gracePeriodMinutes;
  const stagedFiles = detectStagedWorkflowFiles(changedFiles);

  const flagStagedWorkflow = stagedFiles.length > 0 && !hasMarker(issueComments, MARKERS.stagedWorkflowFlagged);
  const openDraftPr = linkedPrs.length === 0 && !withinGrace && !hasMarker(issueComments, MARKERS.draftPrOpened);

  if (!flagStagedWorkflow && !openDraftPr) {
    if (linkedPrs.length > 0) {
      return { type: 'noop', reason: `PR #${linkedPrs[0].number} already exists for this issue`, branch };
    }
    if (withinGrace) {
      return {
        type: 'pending',
        reason:
          `branch "${branch.name}" last active ${elapsedMinutes.toFixed(1)}m ago — ` +
          `within the ${gracePeriodMinutes}m grace period`,
        branch,
        elapsedMinutes,
      };
    }
    return { type: 'noop', reason: 'already repaired and/or flagged — waiting on human review', branch };
  }

  return {
    type: 'repair',
    branch,
    elapsedMinutes,
    openDraftPr,
    flagStagedWorkflow,
    stagedFiles,
  };
}
