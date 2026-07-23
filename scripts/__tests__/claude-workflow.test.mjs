import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/claude.yml', import.meta.url), 'utf8');

test('Claude workflow accepts the narrowly scoped queue-dispatch bot actor', () => {
  assert.match(workflow, /allowed_bots: "github-actions"/);
  assert.doesNotMatch(workflow, /allowed_bots: ["']?\*["']?/);
});

test('queue-dispatched runs enforce an immediate evidence-backed handoff postcondition', () => {
  assert.match(workflow, /Verify queue-dispatched handoff evidence/);
  assert.match(workflow, /always\(\) && github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /node scripts\/verify-agent-handoff\.mjs[\s\\]+--issue/);
  assert.match(workflow, /steps\.claude\.outputs\.execution_file/);
  assert.match(workflow, /permission_denial_count/);
  assert.match(workflow, /github\.run_id/);
  assert.match(workflow, /Mark queue issue failed when implementation or handoff fails/);
  assert.match(workflow, /node scripts\/queue-pr-state\.mjs mark-failed/);
  assert.match(workflow, /automation-handoff:evidence-backed-blocker/);
});
