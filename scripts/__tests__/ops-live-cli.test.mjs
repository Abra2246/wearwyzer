import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deploymentStatusFromState, loadEngineeringState } from '../ops-live-cli.mjs';

const NOW = '2026-07-25T16:30:00.000Z';

function fakeClient() {
  return {
    listOpenIssuesWithLabel(label) {
      if (label === 'blocked') return Promise.resolve([{ number: 33 }]);
      return Promise.resolve([]);
    },
    listOpenPullRequests() {
      return Promise.resolve([{
        number: 68,
        title: 'Recover completed style guides and add verified Samba pilot',
        html_url: 'https://github.example/pr/68',
        draft: true,
        body: 'Closes #62',
        created_at: '2026-07-23T20:00:00.000Z',
        updated_at: '2026-07-25T15:00:00.000Z',
        head: { sha: 'abc123' },
      }]);
    },
    listWorkflowRunsForBranch() {
      return Promise.resolve([{
        conclusion: 'success',
        updated_at: '2026-07-23T20:23:31.000Z',
        html_url: 'https://github.example/actions/old-main',
      }]);
    },
    getPullRequest() {
      return Promise.resolve({
        number: 68,
        title: 'Recover completed style guides and add verified Samba pilot',
        html_url: 'https://github.example/pr/68',
        draft: true,
        mergeable_state: 'clean',
        created_at: '2026-07-23T20:00:00.000Z',
        updated_at: '2026-07-25T15:00:00.000Z',
      });
    },
    getPullRequestReviewDecision() {
      return Promise.resolve(null);
    },
    getCommitCheckSummary(ref) {
      assert.equal(ref, 'abc123');
      return Promise.resolve({
        status: 'passing',
        latestRunIso: '2026-07-25T15:03:21.000Z',
        latestRunUrl: 'https://github.example/actions/current-pr',
        recentFailureCount: 0,
      });
    },
  };
}

test('Mission Control surfaces an unlabeled draft PR and its current checks', async () => {
  const result = await loadEngineeringState(fakeClient(), NOW, null);

  assert.equal(result.fetchOk, true);
  assert.equal(result.data.automationState, 'review');
  assert.equal(result.data.activeIssue, null);
  assert.deepEqual(result.data.pr, {
    number: 68,
    title: 'Recover completed style guides and add verified Samba pilot',
    url: 'https://github.example/pr/68',
    isDraft: true,
    reviewDecision: null,
    mergeableState: 'clean',
    createdIso: '2026-07-23T20:00:00.000Z',
    updatedIso: '2026-07-25T15:00:00.000Z',
  });
  assert.deepEqual(result.data.ci, {
    status: 'passing',
    latestRunIso: '2026-07-25T15:03:21.000Z',
    latestRunUrl: 'https://github.example/actions/current-pr',
    recentFailureCount: 0,
  });
});

test('deployment status distinguishes pending work from a real failure', () => {
  assert.equal(deploymentStatusFromState('success'), 'healthy');
  assert.equal(deploymentStatusFromState('failure'), 'failing');
  assert.equal(deploymentStatusFromState('error'), 'failing');
  assert.equal(deploymentStatusFromState('in_progress'), 'unknown');
  assert.equal(deploymentStatusFromState('queued'), 'unknown');
  assert.equal(deploymentStatusFromState('pending'), 'unknown');
  assert.equal(deploymentStatusFromState(null), 'unknown');
});

test('relative-path CLI invocation actually executes instead of silently exiting', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = spawnSync(
    process.execPath,
    ['scripts/ops-live-cli.mjs', '--dry-run', '--now', NOW],
    { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' } }
  );
  assert.equal(result.status, 0, result.stderr);
  const doc = JSON.parse(result.stdout);
  assert.equal(doc.generatedAtIso, NOW);
  assert.equal(doc.sources.content.wired, true);
});
