import test from 'node:test';
import assert from 'node:assert/strict';
import { planRollback, buildRevertBranchName, buildRevertCommands, buildIncidentReport } from '../rollback.mjs';

test('planRollback: healthy deployment needs no action', () => {
  const plan = planRollback({ healthy: true, previousHealthySha: 'abc', currentSha: 'abc' });
  assert.equal(plan.action, 'none');
});

test('planRollback: unhealthy with no recorded healthy commit -> incident-only, not safe to guess', () => {
  const plan = planRollback({ healthy: false, previousHealthySha: null, currentSha: 'def' });
  assert.equal(plan.action, 'incident-only');
  assert.equal(plan.safe, false);
});

test('planRollback: unhealthy but the last-healthy commit is what is currently deployed -> incident-only', () => {
  const plan = planRollback({ healthy: false, previousHealthySha: 'abc', currentSha: 'abc' });
  assert.equal(plan.action, 'incident-only');
});

test('planRollback: unhealthy with a distinct known-good commit -> open-revert-pr, safe', () => {
  const plan = planRollback({ healthy: false, previousHealthySha: 'abc123', currentSha: 'def456' });
  assert.equal(plan.action, 'open-revert-pr');
  assert.equal(plan.safe, true);
  assert.equal(plan.toSha, 'abc123');
  assert.equal(plan.fromSha, 'def456');
});

test('buildRevertBranchName is deterministic for the same sha', () => {
  assert.equal(buildRevertBranchName('abcdef123456789'), buildRevertBranchName('abcdef123456789'));
  assert.notEqual(buildRevertBranchName('abcdef123456789'), buildRevertBranchName('000000000000000'));
});

test('buildRevertCommands is empty for a non-revert plan and never force-pushes or auto-merges', () => {
  assert.deepEqual(buildRevertCommands({ action: 'incident-only' }), []);
  const commands = buildRevertCommands({ action: 'open-revert-pr', fromSha: 'def456' }).join('\n');
  assert.ok(commands.includes('git revert'));
  assert.ok(!commands.includes('--force'));
  assert.ok(!commands.includes('merge'));
});

test('buildIncidentReport includes failed routes, the plan, and revert commands when applicable', () => {
  const healthResult = { checkedCount: 3, failedRoutes: [{ route: '/shop.html', problems: ['HTTP 500'] }] };
  const plan = { action: 'open-revert-pr', reason: 'reverting to abc123', fromSha: 'def456', toSha: 'abc123' };
  const report = buildIncidentReport({ healthResult, plan, baseUrl: 'https://example.com', currentSha: 'def456' });
  assert.match(report, /production health check failed/i);
  assert.match(report, /\/shop\.html/);
  assert.match(report, /git revert/);
  assert.match(report, /site-incident/);
});
