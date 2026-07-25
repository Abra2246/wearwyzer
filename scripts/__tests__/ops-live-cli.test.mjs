import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngineeringState } from '../ops-live-cli.mjs';

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
