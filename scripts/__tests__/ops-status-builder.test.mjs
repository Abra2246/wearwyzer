import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpsStatus, deriveAutomationState, truncateSummary } from '../ops-status-builder.mjs';
import { validateStatusShape, findSecretLikeValues } from '../ops-status-schema.mjs';

const NOW = '2026-07-13T12:00:00.000Z';

function makeIssue({ number, labels = [], title = `Issue #${number}`, updated_at = NOW } = {}) {
  return { number, title, labels: labels.map((name) => ({ name })), html_url: `https://example.com/issues/${number}`, updated_at };
}

function assertSanitized(status) {
  const shape = validateStatusShape(status);
  assert.deepEqual(shape.errors, [], 'status must satisfy the closed schema');
  assert.deepEqual(findSecretLikeValues(status), [], 'status must contain no secret-like values');
}

test('truncateSummary collapses whitespace and truncates long text', () => {
  assert.equal(truncateSummary('  hello   world  '), 'hello world');
  const long = 'x'.repeat(200);
  const result = truncateSummary(long, 20);
  assert.equal(result.length, 20);
  assert.ok(result.endsWith('…'));
});

test('deriveAutomationState: no active issue, empty queue -> idle', () => {
  assert.equal(deriveAutomationState(null, { readyCount: 0 }), 'idle');
});

test('deriveAutomationState: no active issue, ready issues present -> queued', () => {
  assert.equal(deriveAutomationState(null, { readyCount: 2 }), 'queued');
});

test('deriveAutomationState: active issue labeled in-progress -> working', () => {
  const issue = makeIssue({ number: 1, labels: ['in-progress', 'automation-managed'] });
  assert.equal(deriveAutomationState(issue, { readyCount: 0 }), 'working');
});

test('deriveAutomationState: active issue labeled review -> review', () => {
  const issue = makeIssue({ number: 1, labels: ['review', 'automation-managed'] });
  assert.equal(deriveAutomationState(issue, { readyCount: 0 }), 'review');
});

test('deriveAutomationState: active issue labeled blocked -> blocked', () => {
  const issue = makeIssue({ number: 1, labels: ['blocked'] });
  assert.equal(deriveAutomationState(issue, { readyCount: 0 }), 'blocked');
});

test('deriveAutomationState: active issue labeled automation-failed -> failed', () => {
  const issue = makeIssue({ number: 1, labels: ['automation-failed', 'needs-human'] });
  assert.equal(deriveAutomationState(issue, { readyCount: 0 }), 'failed');
});

test('empty queue produces depth 0 and idle automation state', () => {
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      ci: { status: 'passing', lastRunIso: NOW, lastRunUrl: 'https://example.com/run' },
      lastHealthyDeploy: { sha: 'a1b2c3d4e5f6', timestampIso: NOW },
    },
    { now: NOW }
  );
  assert.equal(status.queue.depth, 0);
  assert.equal(status.automationState, 'idle');
  assert.equal(status.overallHealth, 'green');
  assertSanitized(status);
});

test('overall health: green baseline (idle, no incidents, CI passing, deploy healthy)', () => {
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      ci: { status: 'passing', lastRunIso: NOW, lastRunUrl: 'https://example.com/run' },
      lastHealthyDeploy: { sha: 'a1b2c3d4e5f6', timestampIso: NOW },
    },
    { now: NOW }
  );
  assert.equal(status.overallHealth, 'green');
  assert.equal(status.deployment.status, 'healthy');
  assert.equal(status.deployment.lastHealthyShaShort, 'a1b2c3d');
  assertSanitized(status);
});

test('overall health: red when a site incident is open (queue suspension)', () => {
  const incidentIssue = makeIssue({ number: 42, labels: ['site-incident', 'needs-human'], title: 'Deploy health check failed on main' });
  const status = buildOpsStatus(
    { queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [incidentIssue] } },
    { now: NOW }
  );
  assert.equal(status.overallHealth, 'red');
  assert.equal(status.incident.active, true);
  assert.equal(status.incident.issueNumber, 42);
  assert.equal(status.automationState, 'idle');
  assert.ok(status.blockers.some((b) => b.type === 'site-incident'));
  assertSanitized(status);
});

test('overall health: red on failed CI', () => {
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      ci: { status: 'failing', lastRunIso: NOW, lastRunUrl: 'https://example.com/run' },
    },
    { now: NOW }
  );
  assert.equal(status.overallHealth, 'red');
  assert.equal(status.ci.status, 'failing');
  assertSanitized(status);
});

test('overall health: red on failed deployment', () => {
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      lastHealthyDeploy: { sha: 'a1b2c3d4e5f6', timestampIso: NOW },
      liveDeployCheck: { healthy: false, checkedAtIso: NOW },
    },
    { now: NOW }
  );
  assert.equal(status.overallHealth, 'red');
  assert.equal(status.deployment.status, 'failing');
  assertSanitized(status);
});

test('overall health: yellow when active issue is blocked', () => {
  const blockedIssue = makeIssue({ number: 7, labels: ['blocked', 'in-progress'], title: 'Waiting on a dependency' });
  const status = buildOpsStatus(
    { queue: { inProgressIssues: [blockedIssue], readyIssues: [], blockedIssues: [blockedIssue], incidentIssues: [] } },
    { now: NOW }
  );
  assert.equal(status.overallHealth, 'yellow');
  assert.equal(status.automationState, 'blocked');
  assert.ok(status.blockers.some((b) => b.type === 'issue-blocked'));
  assertSanitized(status);
});

test('active job: guide factory job in-progress is reflected with its jobId', () => {
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      guideJobs: [{ jobId: 'guide-nb530-restock', status: 'in-progress' }, { jobId: 'guide-next', status: 'approved' }],
    },
    { now: NOW }
  );
  assert.equal(status.guideFactory.state, 'in-progress');
  assert.equal(status.guideFactory.activeJobId, 'guide-nb530-restock');
  assert.equal(status.guideFactory.queuedCount, 1);
  assertSanitized(status);
});

test('guide factory needs-human job produces a yellow health and a blocker', () => {
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      guideJobs: [{ jobId: 'guide-stuck', status: 'needs-human' }],
    },
    { now: NOW }
  );
  assert.equal(status.guideFactory.state, 'needs-human');
  assert.equal(status.overallHealth, 'yellow');
  assert.ok(status.blockers.some((b) => b.type === 'guide-job-needs-human'));
  assertSanitized(status);
});

test('active issue in-progress produces a working automation state and populated activeWork', () => {
  const issue = makeIssue({ number: 19, labels: ['in-progress', 'automation-managed'], title: 'Build Mission Control v1' });
  const pr = { number: 21, html_url: 'https://example.com/pull/21', body: 'Closes #19' };
  const status = buildOpsStatus(
    { queue: { inProgressIssues: [issue], readyIssues: [], blockedIssues: [], incidentIssues: [], activePr: pr } },
    { now: NOW }
  );
  assert.equal(status.automationState, 'working');
  assert.equal(status.activeWork.issueNumber, 19);
  assert.equal(status.activeWork.prNumber, 21);
  assertSanitized(status);
});

test('unavailable GitHub state (queue null, ci null) degrades to idle/unknown without throwing', () => {
  const status = buildOpsStatus({ queue: null, ci: null }, { now: NOW });
  assert.equal(status.automationState, 'idle');
  assert.equal(status.ci.status, 'unknown');
  assert.equal(status.overallHealth, 'yellow');
  assertSanitized(status);
});

test('image renderer budget-exceeded is reflected and downgrades health to yellow', () => {
  const spendLedger = [{ guideId: 'g1', timestampIso: NOW, costUsd: 30, accepted: true, stage: 'final', slideOrder: 1 }];
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      ci: { status: 'passing', lastRunIso: NOW, lastRunUrl: 'https://example.com/run' },
      spendLedger,
    },
    { now: NOW }
  );
  assert.equal(status.imageRenderer.state, 'budget-exceeded');
  assert.equal(status.overallHealth, 'yellow');
  assertSanitized(status);
});

test('link engine: no report generated yet degrades to unavailable without affecting health', () => {
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      ci: { status: 'passing', lastRunIso: NOW, lastRunUrl: 'https://example.com/run' },
      lastHealthyDeploy: { sha: 'a1b2c3d4e5f6', timestampIso: NOW },
    },
    { now: NOW }
  );
  assert.equal(status.linkEngine.state, 'unavailable');
  assert.equal(status.linkEngine.portfolioCoveragePct, null);
  assert.equal(status.overallHealth, 'green');
  assertSanitized(status);
});

test('link engine: below-target coverage report downgrades health to yellow with a coverage blocker', () => {
  const linkEngineReport = {
    generatedAtIso: NOW,
    portfolioCoverage: { coveragePct: 55, totalItems: 20, eligibleItems: 11 },
    needsHumanCount: 9,
    brokenCount: 2,
    shortfallCount: 3,
  };
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      ci: { status: 'passing', lastRunIso: NOW, lastRunUrl: 'https://example.com/run' },
      lastHealthyDeploy: { sha: 'a1b2c3d4e5f6', timestampIso: NOW },
      linkEngineReport,
    },
    { now: NOW }
  );
  assert.equal(status.linkEngine.state, 'below-target');
  assert.equal(status.linkEngine.portfolioCoveragePct, 55);
  assert.equal(status.linkEngine.targetMinPct, 80);
  assert.equal(status.linkEngine.needsHumanCount, 9);
  assert.equal(status.overallHealth, 'yellow');
  assert.ok(status.blockers.some((b) => b.type === 'link-coverage-below-target'));
  assertSanitized(status);
});

test('link engine: on-target coverage report does not downgrade health', () => {
  const linkEngineReport = {
    generatedAtIso: NOW,
    portfolioCoverage: { coveragePct: 88, totalItems: 20, eligibleItems: 18 },
    needsHumanCount: 2,
    brokenCount: 0,
    shortfallCount: 0,
  };
  const status = buildOpsStatus(
    {
      queue: { inProgressIssues: [], readyIssues: [], blockedIssues: [], incidentIssues: [] },
      ci: { status: 'passing', lastRunIso: NOW, lastRunUrl: 'https://example.com/run' },
      lastHealthyDeploy: { sha: 'a1b2c3d4e5f6', timestampIso: NOW },
      linkEngineReport,
    },
    { now: NOW }
  );
  assert.equal(status.linkEngine.state, 'on-target');
  assert.equal(status.overallHealth, 'green');
  assert.equal(status.blockers.some((b) => b.type === 'link-coverage-below-target'), false);
  assertSanitized(status);
});
