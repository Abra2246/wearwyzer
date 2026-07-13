// Append-only spend ledger I/O for the OpenAI image renderer (issue #18,
// section 6) — automation/status/openai-spend.jsonl, the same
// append-only-JSON-lines pattern scripts/record-status-event.mjs already
// uses for automation/status/events.jsonl. Budget decisions themselves
// are pure and live in scripts/openai-cost-controls.mjs; this file is
// only the thin fs read/append boundary.
//
// Intentionally absent from version control until the first real run
// creates it — same as automation/status/events.jsonl and
// last-healthy-deploy.json (see automation/status/README.md).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
export const DEFAULT_LEDGER_PATH = path.join(ROOT, 'automation', 'status', 'openai-spend.jsonl');

export function readLedger({ ledgerPath = DEFAULT_LEDGER_PATH } = {}) {
  if (!existsSync(ledgerPath)) return [];
  return readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export function appendLedgerEntries(entries, { ledgerPath = DEFAULT_LEDGER_PATH } = {}) {
  if (!entries || entries.length === 0) return;
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}
