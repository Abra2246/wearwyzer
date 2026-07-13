#!/usr/bin/env node
// Thin fs-writing CLI around scripts/status-log.mjs. Appends one
// JSON-line event to automation/status/events.jsonl — the dashboard-ready
// log issue #17 section 6 requires for routine successes, and every
// exception this pipeline raises.
//
// Usage:
//   node scripts/record-status-event.mjs --kind routine --type guide-published --summary "..."
//   node scripts/record-status-event.mjs --kind exception --type deploy-health-failure --summary "..." --detail "..."
//
// No dependencies, no network access, no secret.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildStatusEvent, serializeEvent, parseEventLines, summarizeDaily, renderDailyDigestMarkdown } from './status-log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
export const DEFAULT_LOG_PATH = path.join(ROOT, 'automation', 'status', 'events.jsonl');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      args[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

export function appendEvent(event, { logPath = DEFAULT_LOG_PATH } = {}) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, serializeEvent(event) + '\n', 'utf8');
}

export function readEvents({ logPath = DEFAULT_LOG_PATH } = {}) {
  if (!existsSync(logPath)) return [];
  return parseEventLines(readFileSync(logPath, 'utf8'));
}

function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  if (command === 'digest') {
    const events = readEvents({});
    const summary = summarizeDaily(events);
    console.log(renderDailyDigestMarkdown(summary, { dateLabel: args.date }));
    return;
  }

  if (!args.kind || !args.type || !args.summary) {
    console.error(
      'Usage: node scripts/record-status-event.mjs --kind <routine|exception> --type <type> --summary "<text>" [--detail "<text>"] [--now <iso>]\n' +
        '       node scripts/record-status-event.mjs digest'
    );
    process.exit(1);
  }

  const event = buildStatusEvent({
    timestampIso: args.now || new Date().toISOString(),
    kind: args.kind,
    type: args.type,
    summary: args.summary,
    detail: args.detail,
  });
  appendEvent(event);
  console.log(`Recorded ${args.kind} event: ${args.type}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
