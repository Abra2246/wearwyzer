import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planWatchdogAction,
  selectMostRecentBranch,
  minutesBetween,
  detectStagedWorkflowFiles,
  branchPrefixForIssue,
  hasMarker,
  MARKERS,
  GRACE_PERIOD_MINUTES,
} from '../handoff-watchdog-rules.mjs';
import { makeIssue } from './fixtures.mjs';

const NOW = '2026-07-13T15:00:00.000Z';

function minutesAgoIso(minutes, fromIso = NOW) {
  return new Date(new Date(fromIso).getTime() - minutes * 60000).toISOString();
}

const AUTOMATION_ISSUE = (overrides = {}) =>
  makeIssue({
    number: 22,
    labels: ['in-progress', 'automation-managed', 'risk-medium', 'priority-p0'],
    body: 'irrelevant for this module',
    ...overrides,
  });

test('branchPrefixForIssue matches the real Claude branch-naming convention', () => {
  assert.equal(branchPrefixForIssue(16), 'claude/issue-16-');
  assert.equal(branchPrefixForIssue(17), 'claude/issue-17-');
});

test('selectMostRecentBranch picks the newest of several candidates', () => {
  const branches = [
    { name: 'claude/issue-22-a', lastCommitIso: minutesAgoIso(30) },
    { name: 'claude/issue-22-b', lastCommitIso: minutesAgoIso(5) },
  ];
  assert.equal(selectMostRecentBranch(branches).name, 'claude/issue-22-b');
});

test('selectMostRecentBranch returns null for an empty list', () => {
  assert.equal(selectMostRecentBranch([]), null);
  assert.equal(selectMostRecentBranch(undefined), null);
});

test('minutesBetween is a pure function of its two inputs', () => {
  assert.equal(minutesBetween(minutesAgoIso(20), NOW), 20);
});

test('detectStagedWorkflowFiles only matches the staged workflows path', () => {
  const files = [
    'scripts/handoff-watchdog.mjs',
    'docs/automation/workflows/handoff-watchdog.yml',
    'docs/AUTOMATION_HANDOFF_WATCHDOG_V1.md',
  ];
  assert.deepEqual(detectStagedWorkflowFiles(files), ['docs/automation/workflows/handoff-watchdog.yml']);
});

test('noop: issue not automation-managed is ignored entirely', () => {
  const issue = makeIssue({ number: 1, labels: ['in-progress'], body: '' });
  const plan = planWatchdogAction({ issue, branch: null, nowIso: NOW });
  assert.equal(plan.type, 'noop');
  assert.match(plan.reason, /not automation-managed/);
});

test('noop: automation-managed issue not in-progress is ignored', () => {
  const issue = makeIssue({ number: 1, labels: ['automation-managed', 'review'], body: '' });
  const plan = planWatchdogAction({ issue, branch: null, nowIso: NOW });
  assert.equal(plan.type, 'noop');
  assert.match(plan.reason, /not in-progress/);
});

test('noop: PR already exists for the branch, nothing left to flag', () => {
  const issue = AUTOMATION_ISSUE();
  const branch = { name: 'claude/issue-22-x', lastCommitIso: minutesAgoIso(30) };
  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs: [{ number: 55 }],
    changedFiles: ['scripts/handoff-watchdog.mjs'],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'noop');
  assert.match(plan.reason, /PR #55 already exists/);
});

// --- Regression fixture: issue #16's exact silent-handoff shape ---------
// Real shape (docs/AUTOMATION_WORKFLOW.md, CHANGELOG.md): Claude pushed
// `claude/issue-16-20260713-0156`, implemented the queue scripts, and
// stopped — no PR was opened by the automation itself, and the issue sat
// `in-progress` until a maintainer opened one by hand.
test('regression #16: completed branch, no PR, grace elapsed -> repair opens a draft PR only', () => {
  const issue = AUTOMATION_ISSUE({ number: 16 });
  const branch = { name: 'claude/issue-16-20260713-0156', lastCommitIso: minutesAgoIso(45) };
  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs: [],
    changedFiles: [
      'scripts/queue-rules.mjs',
      'scripts/queue-dispatch.mjs',
      'scripts/queue-pr-state.mjs',
      'scripts/__tests__/queue-dispatch.test.mjs',
    ],
    issueComments: [],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'repair');
  assert.equal(plan.openDraftPr, true);
  assert.equal(plan.flagStagedWorkflow, false);
  assert.deepEqual(plan.stagedFiles, []);
});

// --- Regression fixture: issue #17's exact silent-handoff shape ---------
// Real shape: same silent-handoff as #16, but the branch additionally
// staged `docs/automation/workflows/{guide-factory-dispatch,
// deploy-health-check}.yml` — files that need a maintainer to copy into
// `.github/workflows/` before they run. The watchdog must not silently
// leave that promotion step undiscoverable.
test('regression #17: completed branch with staged workflow files -> repair opens PR AND flags files', () => {
  const issue = AUTOMATION_ISSUE({ number: 17 });
  const branch = { name: 'claude/issue-17-20260713-0336', lastCommitIso: minutesAgoIso(60) };
  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs: [],
    changedFiles: [
      'scripts/guide-factory.mjs',
      'docs/automation/workflows/guide-factory-dispatch.yml',
      'docs/automation/workflows/deploy-health-check.yml',
    ],
    issueComments: [],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'repair');
  assert.equal(plan.openDraftPr, true);
  assert.equal(plan.flagStagedWorkflow, true);
  assert.deepEqual(plan.stagedFiles, [
    'docs/automation/workflows/guide-factory-dispatch.yml',
    'docs/automation/workflows/deploy-health-check.yml',
  ]);
});

test('pending: branch active within the grace period and nothing staged -> no action yet', () => {
  const issue = AUTOMATION_ISSUE();
  const branch = { name: 'claude/issue-22-x', lastCommitIso: minutesAgoIso(5) };
  const plan = planWatchdogAction({ issue, branch, linkedPrs: [], changedFiles: [], nowIso: NOW });
  assert.equal(plan.type, 'pending');
  assert.ok(plan.elapsedMinutes < GRACE_PERIOD_MINUTES);
});

test('staged workflow files are flagged even within the grace period', () => {
  const issue = AUTOMATION_ISSUE();
  const branch = { name: 'claude/issue-22-x', lastCommitIso: minutesAgoIso(2) };
  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs: [],
    changedFiles: ['docs/automation/workflows/handoff-watchdog.yml'],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'repair');
  assert.equal(plan.openDraftPr, false, 'still within grace period, so no draft PR yet');
  assert.equal(plan.flagStagedWorkflow, true);
});

test('staged workflow files are flagged even when a PR already exists', () => {
  const issue = AUTOMATION_ISSUE();
  const branch = { name: 'claude/issue-22-x', lastCommitIso: minutesAgoIso(2) };
  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs: [{ number: 99 }],
    changedFiles: ['docs/automation/workflows/handoff-watchdog.yml'],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'repair');
  assert.equal(plan.openDraftPr, false);
  assert.equal(plan.flagStagedWorkflow, true);
});

test('escalate-no-branch: completed run with neither branch nor PR', () => {
  const issue = AUTOMATION_ISSUE();
  const plan = planWatchdogAction({ issue, branch: null, linkedPrs: [], issueComments: [], nowIso: NOW });
  assert.equal(plan.type, 'escalate-no-branch');
});

test('idempotency: escalate-no-branch does not repeat once marker comment exists', () => {
  const issue = AUTOMATION_ISSUE();
  const plan = planWatchdogAction({
    issue,
    branch: null,
    linkedPrs: [],
    issueComments: [{ body: `some text\n${MARKERS.escalatedNoBranch}` }],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'noop');
  assert.match(plan.reason, /already escalated/);
});

test('idempotency: repair does not re-open a draft PR once marker comment exists', () => {
  const issue = AUTOMATION_ISSUE();
  const branch = { name: 'claude/issue-22-x', lastCommitIso: minutesAgoIso(45) };
  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs: [],
    changedFiles: [],
    issueComments: [{ body: MARKERS.draftPrOpened }],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'noop');
  assert.match(plan.reason, /already repaired/);
});

test('idempotency: repair does not re-flag staged workflow files once marker comment exists', () => {
  const issue = AUTOMATION_ISSUE();
  const branch = { name: 'claude/issue-22-x', lastCommitIso: minutesAgoIso(45) };
  const plan = planWatchdogAction({
    issue,
    branch,
    linkedPrs: [],
    changedFiles: ['docs/automation/workflows/handoff-watchdog.yml'],
    issueComments: [{ body: MARKERS.draftPrOpened }, { body: MARKERS.stagedWorkflowFlagged }],
    nowIso: NOW,
  });
  assert.equal(plan.type, 'noop');
});

test('hasMarker is a simple substring scan over comment bodies', () => {
  assert.equal(hasMarker([{ body: 'hello' }, { body: `x ${MARKERS.draftPrOpened} y` }], MARKERS.draftPrOpened), true);
  assert.equal(hasMarker([{ body: 'hello' }], MARKERS.draftPrOpened), false);
  assert.equal(hasMarker([], MARKERS.draftPrOpened), false);
});
