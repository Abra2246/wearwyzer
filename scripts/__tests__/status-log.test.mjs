import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatusEvent, serializeEvent, parseEventLines, summarizeDaily, renderDailyDigestMarkdown } from '../status-log.mjs';

test('buildStatusEvent requires an explicit timestamp and a valid kind', () => {
  assert.throws(() => buildStatusEvent({ kind: 'routine', type: 'x', summary: 'x' }));
  assert.throws(() => buildStatusEvent({ timestampIso: '2026-07-13T00:00:00.000Z', kind: 'bogus', type: 'x', summary: 'x' }));
  const event = buildStatusEvent({ timestampIso: '2026-07-13T00:00:00.000Z', kind: 'routine', type: 'x', summary: 'x' });
  assert.equal(event.outcome, null);
});

test('serializeEvent / parseEventLines round-trip through JSON lines', () => {
  const events = [
    buildStatusEvent({ timestampIso: '2026-07-13T00:00:00.000Z', kind: 'routine', type: 'a', summary: 's1' }),
    buildStatusEvent({ timestampIso: '2026-07-13T00:01:00.000Z', kind: 'exception', type: 'b', summary: 's2' }),
  ];
  const text = events.map(serializeEvent).join('\n') + '\n';
  const parsed = parseEventLines(text);
  assert.deepEqual(parsed, events);
});

test('parseEventLines tolerates blank lines and trailing newlines', () => {
  assert.deepEqual(parseEventLines('\n\n'), []);
  assert.deepEqual(parseEventLines(''), []);
});

test('summarizeDaily counts routine vs exception and groups by type', () => {
  const events = [
    buildStatusEvent({ timestampIso: '2026-07-13T00:00:00.000Z', kind: 'routine', type: 'guide-published', summary: 's1' }),
    buildStatusEvent({ timestampIso: '2026-07-13T00:01:00.000Z', kind: 'routine', type: 'guide-published', summary: 's2' }),
    buildStatusEvent({ timestampIso: '2026-07-13T00:02:00.000Z', kind: 'exception', type: 'deploy-health-failure', summary: 's3' }),
  ];
  const summary = summarizeDaily(events);
  assert.equal(summary.total, 3);
  assert.equal(summary.routineCount, 2);
  assert.equal(summary.exceptionCount, 1);
  assert.equal(summary.byType['guide-published'], 2);
  assert.equal(summary.exceptions.length, 1);
});

test('renderDailyDigestMarkdown produces readable markdown including exceptions', () => {
  const summary = summarizeDaily([
    buildStatusEvent({ timestampIso: '2026-07-13T00:00:00.000Z', kind: 'exception', type: 'deploy-health-failure', summary: 'Health check failed.' }),
  ]);
  const markdown = renderDailyDigestMarkdown(summary, { dateLabel: '2026-07-13' });
  assert.match(markdown, /2026-07-13/);
  assert.match(markdown, /Health check failed\./);
});
