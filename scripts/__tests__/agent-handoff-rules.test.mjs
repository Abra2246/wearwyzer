import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BLOCKER_MARKER,
  countPermissionDenials,
  evaluateAgentHandoff,
} from '../agent-handoff-rules.mjs';
import {
  captureAgentHandoffBaseline,
  permissionDenialCountFromFile,
  verifyAgentHandoffAgainstBaseline,
} from '../verify-agent-handoff.mjs';

class FakeClient {
  constructor({
    issue = { labels: ['in-progress'] },
    branches = [],
    changedFiles = {},
    pullRequests = {},
    comments = [],
  } = {}) {
    Object.assign(this, { issue, branches, changedFiles, pullRequests, comments });
  }
  getIssue() { return Promise.resolve(this.issue); }
  listMatchingBranchRefs() { return Promise.resolve(this.branches); }
  compareCommits(_base, branch) { return Promise.resolve(this.changedFiles[branch] || []); }
  listOpenPullRequestsForBranch(branch) { return Promise.resolve(this.pullRequests[branch] || []); }
  listIssueComments() { return Promise.resolve(this.comments); }
}

test('new linked PR is sufficient evidence', () => {
  const result = evaluateAgentHandoff({
    linkedPullRequests: [{ number: 63, headSha: 'new' }],
    baseline: { pullRequests: [], branches: [], blockerCommentIds: [] },
  });
  assert.equal(result.valid, true);
  assert.equal(result.evidence, 'pull-request');
});

test('advanced matching implementation branch is sufficient evidence', () => {
  const result = evaluateAgentHandoff({
    implementationBranches: [{ name: 'claude/issue-61-run', sha: 'new', changedFiles: ['scripts/check.mjs'] }],
    baseline: {
      pullRequests: [],
      branches: [{ name: 'claude/issue-61-run', sha: 'old' }],
      blockerCommentIds: [],
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.evidence, 'implementation-branch');
});

test('stale pre-existing branch cannot satisfy a new run', () => {
  const result = evaluateAgentHandoff({
    implementationBranches: [{ name: 'claude/issue-11-old', sha: 'same', changedFiles: ['old-change.mjs'] }],
    baseline: {
      pullRequests: [],
      branches: [{ name: 'claude/issue-11-old', sha: 'same' }],
      blockerCommentIds: [],
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.detail, /created or advanced/);
});

test('an existing PR must advance during the run', () => {
  const stale = evaluateAgentHandoff({
    linkedPullRequests: [{ number: 63, headSha: 'same' }],
    baseline: { pullRequests: [{ number: 63, headSha: 'same' }], branches: [], blockerCommentIds: [] },
  });
  assert.equal(stale.valid, false);
  const advanced = evaluateAgentHandoff({
    linkedPullRequests: [{ number: 63, headSha: 'new' }],
    baseline: { pullRequests: [{ number: 63, headSha: 'old' }], branches: [], blockerCommentIds: [] },
  });
  assert.equal(advanced.valid, true);
});

test('empty branch without a PR is not evidence', () => {
  const result = evaluateAgentHandoff({
    implementationBranches: [{ name: 'claude/issue-61-run', changedFiles: [] }],
  });
  assert.equal(result.valid, false);
  assert.match(result.detail, /contains no changes/);
});

test('structured blocker requires marker and completed blocker labels', () => {
  const result = evaluateAgentHandoff({
    issueLabels: ['blocked', 'needs-human'],
    issueComments: [{ id: 2, body: `${BLOCKER_MARKER}\n\nReason: missing production credential.` }],
    baseline: { pullRequests: [], branches: [], blockerCommentIds: [1] },
  });
  assert.equal(result.valid, true);
  assert.equal(result.evidence, 'evidence-backed-blocker');
});

test('stale blocker comment cannot satisfy a new run', () => {
  const result = evaluateAgentHandoff({
    issueLabels: ['blocked', 'needs-human'],
    issueComments: [{ id: 1, body: BLOCKER_MARKER }],
    baseline: { pullRequests: [], branches: [], blockerCommentIds: [1] },
  });
  assert.equal(result.valid, false);
  assert.match(result.detail, /no new structured blocker comment/);
});

test('ordinary blocker prose cannot turn a run green', () => {
  const result = evaluateAgentHandoff({
    issueLabels: ['blocked', 'needs-human'],
    issueComments: [{ body: 'I am blocked.' }],
  });
  assert.equal(result.valid, false);
  assert.match(result.detail, /no new structured blocker comment/);
});

test('in-progress issue cannot claim a completed blocker handoff', () => {
  const result = evaluateAgentHandoff({
    issueLabels: ['blocked', 'needs-human', 'in-progress'],
    issueComments: [{ body: BLOCKER_MARKER }],
  });
  assert.equal(result.valid, false);
  assert.match(result.detail, /completed blocker handoff/);
});

test('permission-denial telemetry exposes only the maximum count', () => {
  assert.equal(countPermissionDenials({
    result: { permission_denials: [{ tool: 'redacted' }, { tool: 'redacted' }] },
    summary: { permission_denials_count: 2 },
  }), 2);
  assert.equal(countPermissionDenials({ result: 'no telemetry' }), null);
});

test('execution-file reader handles JSON lines without echoing model output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wearwyzer-handoff-'));
  const file = join(directory, 'execution.jsonl');
  writeFileSync(file, [
    JSON.stringify({ message: 'private model output', permission_denials: [{}] }),
    JSON.stringify({ result: { permission_denials_count: 3 } }),
  ].join('\n'));
  assert.equal(permissionDenialCountFromFile(file), 3);
  assert.equal(permissionDenialCountFromFile(join(directory, 'missing.jsonl')), null);
});

test('dry-run fixture verifies branch and PR evidence created after baseline', async () => {
  const client = new FakeClient({
    branches: [{ name: 'claude/issue-61-run', sha: 'abc' }],
    changedFiles: { 'claude/issue-61-run': ['scripts/fix.mjs'] },
    pullRequests: { 'claude/issue-61-run': [{ number: 64, head: { sha: 'abc' } }] },
  });
  const baseline = { pullRequests: [], branches: [], blockerCommentIds: [] };
  const result = await verifyAgentHandoffAgainstBaseline(client, 61, baseline);
  assert.equal(result.valid, true);
  assert.equal(result.evidence, 'pull-request');
});

test('dry-run fixture rejects a false-success run with no durable evidence', async () => {
  const result = await verifyAgentHandoffAgainstBaseline(
    new FakeClient(),
    61,
    { pullRequests: [], branches: [], blockerCommentIds: [] }
  );
  assert.equal(result.valid, false);
  assert.match(result.detail, /no matching implementation branch/);
});

test('baseline capture records existing refs, PR heads, and blocker comments', async () => {
  const client = new FakeClient({
    branches: [{ name: 'claude/issue-65-old', sha: 'old-sha' }],
    pullRequests: {
      'claude/issue-65-old': [{ number: 64, head: { sha: 'pr-sha' } }],
    },
    comments: [
      { id: 9, body: BLOCKER_MARKER },
      { id: 10, body: 'ordinary comment' },
    ],
  });
  const baseline = await captureAgentHandoffBaseline(client, 65);
  assert.deepEqual(baseline, {
    branches: [{ name: 'claude/issue-65-old', sha: 'old-sha' }],
    pullRequests: [{ number: 64, headSha: 'pr-sha' }],
    blockerCommentIds: [9],
  });
});
