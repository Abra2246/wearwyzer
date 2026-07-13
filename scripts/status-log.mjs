// Machine-readable, dashboard-ready status log (issue #17, section 6:
// "routine successes should be logged to the dashboard ... not sent as
// interruptive alerts"). Pure functions — scripts/record-status-event.mjs
// is the thin fs-writing CLI that actually appends to
// automation/status/events.jsonl.
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md

/**
 * One JSON-serializable event record. `timestampIso` is required from
 * the caller (never generated in here) so this stays a pure function —
 * see the repo-wide rule against calling Date.now() inside anything that
 * needs to be replayed deterministically.
 */
export function buildStatusEvent({ timestampIso, kind, type, summary, outcome, detail }) {
  if (!timestampIso) throw new Error('buildStatusEvent requires timestampIso');
  if (!['routine', 'exception'].includes(kind)) throw new Error(`buildStatusEvent: kind must be "routine" or "exception", got "${kind}"`);
  return { timestampIso, kind, type, summary, outcome: outcome || null, detail: detail || null };
}

export function serializeEvent(event) {
  return JSON.stringify(event);
}

export function parseEventLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * Aggregates a set of events into the daily digest issue #17 describes
 * ("optionally summarized daily"): counts by kind/type/outcome, plus the
 * exception events verbatim since those are few and worth naming
 * individually in a digest.
 */
export function summarizeDaily(events) {
  const summary = {
    total: events.length,
    routineCount: 0,
    exceptionCount: 0,
    byType: {},
    exceptions: [],
  };
  for (const event of events) {
    if (event.kind === 'routine') summary.routineCount += 1;
    else summary.exceptionCount += 1;
    summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
    if (event.kind === 'exception') summary.exceptions.push(event);
  }
  return summary;
}

export function renderDailyDigestMarkdown(summary, { dateLabel } = {}) {
  const lines = [
    `## Automation daily digest${dateLabel ? ` — ${dateLabel}` : ''}`,
    '',
    `- Total events: ${summary.total}`,
    `- Routine: ${summary.routineCount}`,
    `- Exceptions: ${summary.exceptionCount}`,
    '',
    '### By type',
    ...Object.entries(summary.byType).map(([type, count]) => `- \`${type}\`: ${count}`),
  ];
  if (summary.exceptions.length) {
    lines.push('', '### Exceptions', ...summary.exceptions.map((e) => `- **${e.type}**: ${e.summary}`));
  }
  return lines.join('\n');
}
