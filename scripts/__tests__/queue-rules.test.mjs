import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIssue,
  selectNextIssue,
  canDispatch,
  planDispatch,
  touchesProtectedPath,
  evaluateAutoMergeEligibility,
  extractLinkedIssueNumbers,
  determinePrSyncAction,
} from '../queue-rules.mjs';
import {
  READY_LOW_RISK_ISSUE,
  READY_HIGH_PRIORITY_ISSUE,
  READY_HIGH_RISK_ISSUE,
  MALFORMED_ISSUE,
  MALFORMED_NO_RISK_LABEL_ISSUE,
} from './fixtures.mjs';

// -- no eligible issue ------------------------------------------------------

test('no eligible issue: empty ready list selects nothing', () => {
  const { selected } = selectNextIssue([]);
  assert.equal(selected, null);
});

test('no eligible issue: all candidates rejected selects nothing', () => {
  const { selected, evaluated } = selectNextIssue([READY_HIGH_RISK_ISSUE, MALFORMED_ISSUE]);
  assert.equal(selected, null);
  assert.equal(evaluated.every((e) => !e.valid), true);
});

// -- active work prevents dispatch ------------------------------------------

test('active work prevents dispatch: in-progress issue blocks', () => {
  const gate = canDispatch({ inProgressIssues: [{ number: 5 }], openAutomationManagedPrs: [] });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /#5/);
});

test('active work prevents dispatch: open automation-managed PR blocks', () => {
  const gate = canDispatch({ inProgressIssues: [], openAutomationManagedPrs: [{ number: 9 }] });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /#9/);
});

// -- site-incident suspends the queue ---------------------------------------

test('open site-incident issue suspends dispatch even with no other active work', () => {
  const gate = canDispatch({ inProgressIssues: [], openAutomationManagedPrs: [], openIncidentIssues: [{ number: 42 }] });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /site-incident/);
  assert.match(gate.reason, /#42/);
});

test('open site-incident issue takes priority over an in-progress issue in the reported reason', () => {
  const gate = canDispatch({
    inProgressIssues: [{ number: 5 }],
    openAutomationManagedPrs: [],
    openIncidentIssues: [{ number: 42 }],
  });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /#42/);
});

test('planDispatch is a noop when an incident issue is open, even with an eligible ready issue', () => {
  const plan = planDispatch({
    inProgressIssues: [],
    openAutomationManagedPrs: [],
    openIncidentIssues: [{ number: 42 }],
    readyIssues: [READY_LOW_RISK_ISSUE],
  });
  assert.equal(plan.type, 'noop');
  assert.match(plan.reason, /site-incident/);
});

test('no open incident issues does not block dispatch', () => {
  const gate = canDispatch({ inProgressIssues: [], openAutomationManagedPrs: [], openIncidentIssues: [] });
  assert.equal(gate.allowed, true);
});

// -- malformed issue rejected -------------------------------------------

test('malformed issue rejected: missing acceptance criteria section', () => {
  const result = validateIssue(MALFORMED_ISSUE);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((r) => r.includes('acceptance criteria')));
});

test('malformed issue rejected: missing/duplicate risk label', () => {
  const result = validateIssue(MALFORMED_NO_RISK_LABEL_ISSUE);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((r) => r.includes('risk-low/risk-medium/risk-high')));
});

// -- risk-high rejected ----------------------------------------------------

test('risk-high rejected even when otherwise well-formed', () => {
  const result = validateIssue(READY_HIGH_RISK_ISSUE);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((r) => r.includes('explicit human approval')));

  const { selected } = selectNextIssue([READY_HIGH_RISK_ISSUE, READY_LOW_RISK_ISSUE]);
  assert.equal(selected.issue.number, READY_LOW_RISK_ISSUE.number);
});

// -- deterministic priority selection ---------------------------------------

test('deterministic priority selection: p0 beats p2, repeated calls agree', () => {
  const issues = [READY_LOW_RISK_ISSUE, READY_HIGH_PRIORITY_ISSUE];
  const first = selectNextIssue(issues).selected.issue.number;
  const second = selectNextIssue([...issues].reverse()).selected.issue.number;
  assert.equal(first, READY_HIGH_PRIORITY_ISSUE.number);
  assert.equal(second, READY_HIGH_PRIORITY_ISSUE.number);
});

// -- exactly one issue claimed -----------------------------------------

test('exactly one issue claimed per plan', () => {
  const plan = planDispatch({
    inProgressIssues: [],
    openAutomationManagedPrs: [],
    readyIssues: [READY_LOW_RISK_ISSUE, READY_HIGH_PRIORITY_ISSUE],
  });
  assert.equal(plan.type, 'dispatch');
  assert.equal(typeof plan.issue.number, 'number');
});

// -- protected-path detection -----------------------------------------------

test('protected-path detection', () => {
  assert.equal(touchesProtectedPath(['.github/workflows/claude.yml']), true);
  assert.equal(touchesProtectedPath(['support.js']), true);
  assert.equal(touchesProtectedPath(['privacy.dc.html']), true);
  assert.equal(touchesProtectedPath(['js/products.js']), false);
  assert.equal(touchesProtectedPath(['guide-nb9060.dc.html']), false);
});

// -- low-risk merge gate false by default ------------------------------

test('low-risk merge gate is false by default (feature flag unset)', () => {
  const gate = evaluateAutoMergeEligibility({
    issueLabels: [{ name: 'automation-managed' }, { name: 'risk-low' }],
    prLabels: [{ name: 'automation-managed' }, { name: 'risk-low' }],
    prIsDraft: false,
    requiredChecksPassed: true,
    changedFiles: ['js/products.js'],
    unresolvedReviewThreadCount: 0,
    // featureFlagEnabled intentionally omitted -> defaults to false
  });
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.some((r) => r.includes('AUTOMATION_AUTO_MERGE_ENABLED')));
});

test('low-risk merge gate: eligible only when every condition including the flag is met', () => {
  const gate = evaluateAutoMergeEligibility({
    issueLabels: [{ name: 'automation-managed' }, { name: 'risk-low' }],
    prLabels: [{ name: 'automation-managed' }, { name: 'risk-low' }],
    prIsDraft: false,
    requiredChecksPassed: true,
    changedFiles: ['js/products.js'],
    unresolvedReviewThreadCount: 0,
    featureFlagEnabled: true,
  });
  assert.equal(gate.eligible, true);
});

test('low-risk merge gate: protected path blocks even with the flag enabled', () => {
  const gate = evaluateAutoMergeEligibility({
    issueLabels: [{ name: 'automation-managed' }, { name: 'risk-low' }],
    prLabels: [{ name: 'automation-managed' }, { name: 'risk-low' }],
    prIsDraft: false,
    requiredChecksPassed: true,
    changedFiles: ['.github/workflows/claude.yml'],
    unresolvedReviewThreadCount: 0,
    featureFlagEnabled: true,
  });
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.some((r) => r.includes('protected path')));
});

// -- supporting rule coverage -------------------------------------------

test('extractLinkedIssueNumbers reads "Closes #N" style references', () => {
  assert.deepEqual(extractLinkedIssueNumbers('Some text.\n\nCloses #16\n'), [16]);
  assert.deepEqual(extractLinkedIssueNumbers('Fixes: #7 and closes #9'), [7, 9]);
  assert.deepEqual(extractLinkedIssueNumbers('No reference here'), []);
});

test('determinePrSyncAction: draft PR does not move issue to review', () => {
  const action = determinePrSyncAction({
    issueLabels: [{ name: 'automation-managed' }, { name: 'in-progress' }],
    prIsDraft: true,
    prState: 'open',
  });
  assert.equal(action.type, 'noop');
});

test('determinePrSyncAction: ready PR moves in-progress issue to review', () => {
  const action = determinePrSyncAction({
    issueLabels: [{ name: 'automation-managed' }, { name: 'in-progress' }],
    prIsDraft: false,
    prState: 'open',
  });
  assert.equal(action.type, 'move-to-review');
});
