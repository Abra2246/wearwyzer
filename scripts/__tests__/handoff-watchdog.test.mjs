import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateIssue, runWatchdog, buildDraftPrTitle } from '../handoff-watchdog.mjs';
import { MARKERS } from '../handoff-watchdog-rules.mjs';
import { makeIssue } from './fixtures.mjs';

const NOW = '2026-07-13T15:00:00.000Z';
function minutesAgoIso(minutes) {
  return new Date(new Date(NOW).getTime() - minutes * 60000).toISOString();
}

// Fake GitHub client: records every mutating call so tests can assert a
// dry run performs zero writes and a live run performs exactly the
// expected sequence, without any network access — same pattern as
// scripts/__tests__/queue-dispatch.test.mjs's FakeClient.
class FakeClient {
  constructor({
    branchRefs = [],
    branchCommitDates = {},
    comments = [],
    prsForBranch = [],
    compareFiles = [],
    prFiles = [],
    issues = [],
  } = {}) {
    this.branchRefs = branchRefs;
    this.branchCommitDates = branchCommitDates;
    this.comments = comments;
    this.prsForBranch = prsForBranch;
    this.compareFiles = compareFiles;
    this.prFiles = prFiles;
    this.issues = issues;
    this.calls = [];
  }
  listOpenIssuesWithLabel(label) {
    return Promise.resolve(label === 'in-progress' ? this.issues : []);
  }
  listMatchingBranchRefs() {
    return Promise.resolve(this.branchRefs);
  }
  getBranchLastCommitIso(name) {
    return Promise.resolve(this.branchCommitDates[name]);
  }
  listIssueComments() {
    return Promise.resolve(this.comments);
  }
  listOpenPullRequestsForBranch() {
    return Promise.resolve(this.prsForBranch);
  }
  compareCommits() {
    return Promise.resolve(this.compareFiles);
  }
  listChangedFiles() {
    return Promise.resolve(this.prFiles);
  }
  listWorkflowRunsForBranch() {
    return Promise.resolve([]);
  }
  createPullRequest(opts) {
    this.calls.push(['createPullRequest', opts]);
    return Promise.resolve({ number: 500 });
  }
  addLabels(...args) {
    this.calls.push(['addLabels', ...args]);
    return Promise.resolve();
  }
  removeLabel(...args) {
    this.calls.push(['removeLabel', ...args]);
    return Promise.resolve();
  }
  createComment(...args) {
    this.calls.push(['createComment', ...args]);
    return Promise.resolve();
  }
}

const AUTOMATION_MANAGED_LABELS = ['in-progress', 'automation-managed', 'risk-medium', 'priority-p0'];

test('buildDraftPrTitle references the real issue number and title', () => {
  const issue = makeIssue({ number: 16, labels: AUTOMATION_MANAGED_LABELS, body: '', title: 'Add the queue' });
  assert.equal(buildDraftPrTitle(issue), 'Automated repair PR for #16: Add the queue');
});

test('#16-like regression: repairs a silent handoff end-to-end (draft PR + move to review)', async () => {
  const issue = makeIssue({ number: 16, labels: AUTOMATION_MANAGED_LABELS, body: '' });
  const client = new FakeClient({
    branchRefs: [{ name: 'claude/issue-16-20260713-0156', sha: 'abc' }],
    branchCommitDates: { 'claude/issue-16-20260713-0156': minutesAgoIso(45) },
    compareFiles: ['scripts/queue-rules.mjs', 'scripts/queue-dispatch.mjs'],
  });

  const result = await evaluateIssue(client, issue, { nowIso: NOW });

  assert.equal(result.type, 'repair');
  assert.equal(result.openDraftPr, true);
  assert.equal(result.flagStagedWorkflow, false);

  const kinds = client.calls.map((c) => c[0]);
  assert.deepEqual(kinds, ['createPullRequest', 'addLabels', 'removeLabel', 'addLabels', 'createComment']);

  const prCall = client.calls[0][1];
  assert.equal(prCall.head, 'claude/issue-16-20260713-0156');
  assert.equal(prCall.base, 'main');
  assert.equal(prCall.draft, true);
  assert.match(prCall.body, /Closes #16/);
  assert.match(prCall.body, new RegExp(MARKERS.draftPrOpened.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.deepEqual(client.calls[1], ['addLabels', 500, ['automation-managed', 'risk-medium']]);
  assert.deepEqual(client.calls[2], ['removeLabel', 16, 'in-progress']);
  assert.deepEqual(client.calls[3], ['addLabels', 16, ['review']]);

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, 'handoff-draft-pr-opened');
  assert.equal(result.events[0].kind, 'routine');
});

test('#17-like regression: staged workflow files are flagged in the same pass as opening the draft PR', async () => {
  const issue = makeIssue({ number: 17, labels: AUTOMATION_MANAGED_LABELS, body: '' });
  const client = new FakeClient({
    branchRefs: [{ name: 'claude/issue-17-20260713-0336', sha: 'def' }],
    branchCommitDates: { 'claude/issue-17-20260713-0336': minutesAgoIso(60) },
    compareFiles: [
      'scripts/guide-factory.mjs',
      'docs/automation/workflows/guide-factory-dispatch.yml',
      'docs/automation/workflows/deploy-health-check.yml',
    ],
  });

  const result = await evaluateIssue(client, issue, { nowIso: NOW });

  assert.equal(result.type, 'repair');
  assert.equal(result.openDraftPr, true);
  assert.equal(result.flagStagedWorkflow, true);
  assert.deepEqual(result.stagedFiles, [
    'docs/automation/workflows/guide-factory-dispatch.yml',
    'docs/automation/workflows/deploy-health-check.yml',
  ]);

  const kinds = client.calls.map((c) => c[0]);
  assert.deepEqual(kinds, [
    'createPullRequest',
    'addLabels',
    'removeLabel',
    'addLabels',
    'createComment',
    'addLabels',
    'createComment',
  ]);
  assert.deepEqual(client.calls[5], ['addLabels', 17, ['needs-human']]);
  const stagedComment = client.calls[6][2];
  assert.match(stagedComment, /guide-factory-dispatch\.yml/);
  assert.match(stagedComment, /deploy-health-check\.yml/);
  assert.match(stagedComment, /PR #500/);

  assert.equal(result.events.length, 2);
  assert.deepEqual(
    result.events.map((e) => e.type),
    ['handoff-draft-pr-opened', 'staged-workflow-needs-promotion']
  );
  assert.equal(result.events[1].kind, 'exception');
});

test('escalates when a completed run has neither a usable branch nor a PR', async () => {
  const issue = makeIssue({ number: 22, labels: AUTOMATION_MANAGED_LABELS, body: '' });
  const client = new FakeClient({ branchRefs: [] });

  const result = await evaluateIssue(client, issue, { nowIso: NOW });

  assert.equal(result.type, 'escalate-no-branch');
  const kinds = client.calls.map((c) => c[0]);
  assert.deepEqual(kinds, ['removeLabel', 'addLabels', 'createComment']);
  assert.deepEqual(client.calls[0], ['removeLabel', 22, 'in-progress']);
  assert.deepEqual(client.calls[1], ['addLabels', 22, ['automation-failed', 'needs-human']]);
  assert.match(client.calls[2][2], new RegExp(MARKERS.escalatedNoBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.equal(result.events[0].type, 'automation-blocked-after-retries');
  assert.equal(result.events[0].kind, 'exception');
});

test('pending: branch still within the grace period performs no mutation', async () => {
  const issue = makeIssue({ number: 22, labels: AUTOMATION_MANAGED_LABELS, body: '' });
  const client = new FakeClient({
    branchRefs: [{ name: 'claude/issue-22-x', sha: 'a' }],
    branchCommitDates: { 'claude/issue-22-x': minutesAgoIso(5) },
  });

  const result = await evaluateIssue(client, issue, { nowIso: NOW });

  assert.equal(result.type, 'pending');
  assert.equal(client.calls.length, 0);
  assert.equal(result.events[0].type, 'handoff-pending');
});

test('idempotency: a second pass after both markers are posted performs no further mutation', async () => {
  const issue = makeIssue({ number: 17, labels: AUTOMATION_MANAGED_LABELS, body: '' });
  const client = new FakeClient({
    branchRefs: [{ name: 'claude/issue-17-20260713-0336', sha: 'def' }],
    branchCommitDates: { 'claude/issue-17-20260713-0336': minutesAgoIso(60) },
    compareFiles: ['docs/automation/workflows/guide-factory-dispatch.yml'],
    comments: [{ body: MARKERS.draftPrOpened }, { body: MARKERS.stagedWorkflowFlagged }],
  });

  const result = await evaluateIssue(client, issue, { nowIso: NOW });

  assert.equal(result.type, 'noop');
  assert.equal(client.calls.length, 0);
});

test('dry run performs zero mutations even past the grace period', async () => {
  const issue = makeIssue({ number: 16, labels: AUTOMATION_MANAGED_LABELS, body: '' });
  const client = new FakeClient({
    branchRefs: [{ name: 'claude/issue-16-20260713-0156', sha: 'abc' }],
    branchCommitDates: { 'claude/issue-16-20260713-0156': minutesAgoIso(45) },
  });

  const result = await evaluateIssue(client, issue, { nowIso: NOW, dryRun: true });

  assert.equal(result.type, 'repair');
  assert.equal(client.calls.length, 0);
});

test('runWatchdog evaluates every automation-managed in-progress issue and reports one result each', async () => {
  const readyToRepair = makeIssue({ number: 16, labels: AUTOMATION_MANAGED_LABELS, body: '' });
  const stillPending = makeIssue({ number: 22, labels: AUTOMATION_MANAGED_LABELS, body: '' });

  const client = new FakeClient({ issues: [readyToRepair, stillPending] });
  // Both issues share one FakeClient instance, so give it a way to
  // differentiate branch lookups per issue via matching prefixes.
  client.listMatchingBranchRefs = (prefix) => {
    if (prefix === 'claude/issue-16-') return Promise.resolve([{ name: 'claude/issue-16-20260713-0156', sha: 'abc' }]);
    if (prefix === 'claude/issue-22-') return Promise.resolve([{ name: 'claude/issue-22-x', sha: 'def' }]);
    return Promise.resolve([]);
  };
  client.getBranchLastCommitIso = (name) => {
    if (name === 'claude/issue-16-20260713-0156') return Promise.resolve(minutesAgoIso(45));
    if (name === 'claude/issue-22-x') return Promise.resolve(minutesAgoIso(2));
    return Promise.resolve(null);
  };

  const recordedEvents = [];
  const result = await runWatchdog(client, { nowIso: NOW, appendEventFn: (e) => recordedEvents.push(e) });

  assert.equal(result.results.length, 2);
  const byIssue = Object.fromEntries(result.results.map((r) => [r.issueNumber, r.type]));
  assert.equal(byIssue[16], 'repair');
  assert.equal(byIssue[22], 'pending');
  assert.equal(recordedEvents.length, result.events.length);
  assert.ok(recordedEvents.length >= 2);
});
