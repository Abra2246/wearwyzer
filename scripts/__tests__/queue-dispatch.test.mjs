import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../queue-dispatch.mjs';
import { READY_LOW_RISK_ISSUE } from './fixtures.mjs';

// Fake GitHub client: records every mutating call so tests can assert a
// dry run performs zero writes, and a live run performs exactly the
// expected sequence — without any network access.
class FakeClient {
  constructor(state) {
    this.state = state;
    this.calls = [];
  }
  listOpenIssuesWithLabel(label) {
    if (label === 'in-progress') return Promise.resolve(this.state.inProgressIssues);
    if (label === 'ready') return Promise.resolve(this.state.readyIssues);
    return Promise.resolve([]);
  }
  listOpenPullRequestsWithLabel() {
    return Promise.resolve(this.state.openAutomationManagedPrs);
  }
  removeLabel(...args) {
    this.calls.push(['removeLabel', ...args]);
    return Promise.resolve();
  }
  addLabels(...args) {
    this.calls.push(['addLabels', ...args]);
    return Promise.resolve();
  }
  createComment(...args) {
    this.calls.push(['createComment', ...args]);
    return Promise.resolve();
  }
}

test('dry run causes no mutation', async () => {
  const client = new FakeClient({
    inProgressIssues: [],
    openAutomationManagedPrs: [],
    readyIssues: [READY_LOW_RISK_ISSUE],
  });
  const plan = await dispatch(client, { dryRun: true });
  assert.equal(plan.type, 'dispatch');
  assert.equal(client.calls.length, 0);
});

test('live run mutates exactly once per label/comment call, in order', async () => {
  const client = new FakeClient({
    inProgressIssues: [],
    openAutomationManagedPrs: [],
    readyIssues: [READY_LOW_RISK_ISSUE],
  });
  await dispatch(client, { dryRun: false });
  const kinds = client.calls.map((c) => c[0]);
  assert.deepEqual(kinds, ['removeLabel', 'addLabels', 'createComment']);
  assert.equal(client.calls[0][1], READY_LOW_RISK_ISSUE.number);
});

test('active work prevents dispatch end-to-end: no mutation when an issue is already in-progress', async () => {
  const client = new FakeClient({
    inProgressIssues: [{ number: 5 }],
    openAutomationManagedPrs: [],
    readyIssues: [READY_LOW_RISK_ISSUE],
  });
  const plan = await dispatch(client, { dryRun: false });
  assert.equal(plan.type, 'noop');
  assert.equal(client.calls.length, 0);
});

test('active work prevents dispatch end-to-end: no mutation when an automation-managed PR is open', async () => {
  const client = new FakeClient({
    inProgressIssues: [],
    openAutomationManagedPrs: [{ number: 9 }],
    readyIssues: [READY_LOW_RISK_ISSUE],
  });
  const plan = await dispatch(client, { dryRun: false });
  assert.equal(plan.type, 'noop');
  assert.equal(client.calls.length, 0);
});
