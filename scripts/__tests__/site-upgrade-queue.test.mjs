// Issue #17 section 3: "site upgrade" jobs run through the *same*
// autonomous queue issue #16 already built (scripts/queue-rules.mjs) —
// there is no separate site-upgrade dispatcher. These tests exist to
// prove that generic claim concretely: a site-upgrade issue behaves
// exactly like any other queue issue at every risk tier, and an open
// site-incident correctly suspends it same as any other work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIssue, selectNextIssue, canDispatch, evaluateAutoMergeEligibility } from '../queue-rules.mjs';
import { makeIssue, COMPLETE_BODY } from './fixtures.mjs';

const LOW_RISK_SITE_UPGRADE = makeIssue({
  number: 201,
  labels: ['ready', 'risk-low', 'automation-managed', 'priority-p2'],
  body: COMPLETE_BODY,
});

const MEDIUM_RISK_SITE_UPGRADE = makeIssue({
  number: 202,
  labels: ['ready', 'risk-medium', 'automation-managed', 'priority-p1'],
  body: COMPLETE_BODY,
});

const HIGH_RISK_SITE_UPGRADE = makeIssue({
  number: 203,
  labels: ['ready', 'risk-high', 'automation-managed', 'priority-p0'],
  body: COMPLETE_BODY,
});

test('routine low-risk site upgrade is eligible for dispatch like any other risk-low issue', () => {
  const result = validateIssue(LOW_RISK_SITE_UPGRADE);
  assert.equal(result.valid, true);
  assert.equal(result.riskTier, 'low');
});

test('routine low-risk site upgrade progresses through the guarded auto-merge gate once every condition is met', () => {
  const gate = evaluateAutoMergeEligibility({
    issueLabels: LOW_RISK_SITE_UPGRADE.labels,
    prLabels: [{ name: 'automation-managed' }, { name: 'risk-low' }],
    prIsDraft: false,
    requiredChecksPassed: true,
    changedFiles: ['js/products.js'],
    unresolvedReviewThreadCount: 0,
    featureFlagEnabled: true,
  });
  assert.equal(gate.eligible, true);
});

test('medium-risk site upgrade is eligible to dispatch but never eligible for the auto-merge gate', () => {
  const result = validateIssue(MEDIUM_RISK_SITE_UPGRADE);
  assert.equal(result.valid, true);
  const gate = evaluateAutoMergeEligibility({
    issueLabels: MEDIUM_RISK_SITE_UPGRADE.labels,
    prLabels: [{ name: 'automation-managed' }, { name: 'risk-medium' }],
    prIsDraft: false,
    requiredChecksPassed: true,
    changedFiles: [],
    unresolvedReviewThreadCount: 0,
    featureFlagEnabled: true,
  });
  assert.equal(gate.eligible, false); // gate requires risk-low specifically — medium always stops in review
});

test('high-risk site upgrade is never selected for automatic dispatch', () => {
  const { selected } = selectNextIssue([HIGH_RISK_SITE_UPGRADE, LOW_RISK_SITE_UPGRADE]);
  assert.equal(selected.issue.number, LOW_RISK_SITE_UPGRADE.number);
});

test('an open site-incident suspends site-upgrade dispatch exactly like engineering-issue dispatch', () => {
  const gate = canDispatch({ inProgressIssues: [], openAutomationManagedPrs: [], openIncidentIssues: [{ number: 99 }] });
  assert.equal(gate.allowed, false);
});
