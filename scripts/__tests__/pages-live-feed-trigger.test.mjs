import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pagesWorkflow = readFileSync('.github/workflows/pages.yml', 'utf8');
const liveFeedWorkflow = readFileSync('.github/workflows/ops-live-feed-refresh.yml', 'utf8');

test('Pages deploys after a completed Ops Live Feed refresh', () => {
  assert.match(
    pagesWorkflow,
    /workflow_run:\s*\n\s+workflows:\s*\["Ops Live Feed Refresh"\]\s*\n\s+types:\s*\[completed\]/,
  );
});

test('only a successful main-branch live-feed completion may enter validation', () => {
  assert.match(pagesWorkflow, /github\.event_name != 'workflow_run'/);
  assert.match(pagesWorkflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(pagesWorkflow, /github\.event\.workflow_run\.head_branch == 'main'/);
});

test('ordinary main pushes and manual Pages deployments remain available', () => {
  assert.match(pagesWorkflow, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(pagesWorkflow, /workflow_dispatch:/);
});

test('the Pages path retains narrow permissions and non-cancelling concurrency', () => {
  assert.match(pagesWorkflow, /contents:\s*read/);
  assert.match(pagesWorkflow, /pages:\s*write/);
  assert.match(pagesWorkflow, /id-token:\s*write/);
  assert.match(pagesWorkflow, /group:\s*pages/);
  assert.match(pagesWorkflow, /cancel-in-progress:\s*false/);
});

test('the live-feed workflow ignores its own output and cannot recurse through Pages', () => {
  assert.match(
    liveFeedWorkflow,
    /paths-ignore:\s*\n\s+- 'ops\/live-feed\.json'\s*\n\s+- 'ops\/status\.json'/,
  );
  assert.doesNotMatch(liveFeedWorkflow, /workflow_run:/);
  assert.doesNotMatch(pagesWorkflow, /Ops Status Refresh/);
});
