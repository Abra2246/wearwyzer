import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/claude.yml', import.meta.url), 'utf8');

test('Claude workflow accepts the narrowly scoped queue-dispatch bot actor', () => {
  assert.match(workflow, /allowed_bots: "github-actions"/);
  assert.doesNotMatch(workflow, /allowed_bots: ["']?\*["']?/);
});
