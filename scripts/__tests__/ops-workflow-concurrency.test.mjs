import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPairs = [
  [
    '.github/workflows/ops-live-feed-refresh.yml',
    'docs/automation/workflows/ops-live-feed-refresh.yml',
  ],
  [
    '.github/workflows/ops-status-refresh.yml',
    'docs/automation/workflows/ops-status-refresh.yml',
  ],
];

for (const [activePath, referencePath] of workflowPairs) {
  test(`${activePath} safely retries concurrent main updates`, () => {
    const active = readFileSync(activePath, 'utf8');
    const reference = readFileSync(referencePath, 'utf8');

    for (const source of [active, reference]) {
      assert.match(source, /fetch-depth:\s*0/);
      assert.match(source, /max_attempts=3/);
      assert.match(source, /git fetch --no-tags origin main/);
      assert.match(source, /git rebase origin\/main/);
      assert.match(source, /git push origin HEAD:main/);
      assert.match(source, /git rebase --abort \|\| true/);
      assert.doesNotMatch(source, /git push[^\n]*(--force|-f)\b/);
    }

    const activePushBlock = active.slice(active.indexOf('max_attempts=3'));
    const referencePushBlock = reference.slice(reference.indexOf('max_attempts=3'));
    assert.equal(referencePushBlock, activePushBlock);
  });
}
