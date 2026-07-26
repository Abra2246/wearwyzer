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
  test(`${activePath} serializes writers and regenerates after main advances`, () => {
    const active = readFileSync(activePath, 'utf8');
    const reference = readFileSync(referencePath, 'utf8');

    for (const source of [active, reference]) {
      assert.match(source, /fetch-depth:\s*0/);
      assert.match(source, /group:\s*ops-feed-refresh-writers/);
      assert.match(source, /cancel-in-progress:\s*false/);
      assert.match(
        source,
        /paths-ignore:\s*\n\s+- 'ops\/(?:live-feed|status)\.json'\s*\n\s+- 'ops\/(?:status|live-feed)\.json'/,
      );
      assert.match(source, /max_attempts=3/);
      assert.match(source, /git fetch --no-tags origin main/);
      assert.match(source, /git reset --hard origin\/main/);
      assert.match(source, /node scripts\/ops-(?:live|status)-cli\.mjs/);
      assert.match(source, /git push origin HEAD:main/);
      assert.doesNotMatch(source, /git rebase origin\/main/);
      assert.doesNotMatch(source, /git push[^\n]*(--force|-f)\b/);
    }

    const activePushBlock = active.slice(active.indexOf('max_attempts=3'));
    const referencePushBlock = reference.slice(reference.indexOf('max_attempts=3'));
    assert.equal(referencePushBlock, activePushBlock);
  });
}
