import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshLinkEngineReportInFreshProcess } from '../guide-production-writer-cli.mjs';

test('production writer refreshes the link report across a fresh process cache boundary', () => {
  let observed = null;
  const output = refreshLinkEngineReportInFreshProcess({
    now: '2026-07-23T20:25:00.000Z',
    spawn(command, args, options) {
      observed = { command, args, options };
      return { status: 0, stdout: '{"ok":true}\n', stderr: '' };
    },
  });

  assert.equal(observed.command, process.execPath);
  assert.match(observed.args[0], /scripts\/link-engine-cli\.mjs$/);
  assert.equal(observed.args[1], '--now=2026-07-23T20:25:00.000Z');
  assert.equal(observed.options.encoding, 'utf8');
  assert.equal(output, '{"ok":true}\n');
});

test('production writer fails closed when the fresh link-report process fails', () => {
  assert.throws(
    () =>
      refreshLinkEngineReportInFreshProcess({
        now: '2026-07-23T20:25:00.000Z',
        spawn() {
          return { status: 1, stdout: '', stderr: 'adapter failed' };
        },
      }),
    /adapter failed/
  );
});
