import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicAndOpsFiles = [
  'ops/live-feed.json',
  'ops/status.json',
  'automation/status/events.jsonl',
  'js/site-data.js',
];

test('public and operational artifacts never receive personalization fixture payloads', () => {
  for (const file of publicAndOpsFiles) {
    const content = readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, /fixture-user-menswear-01/, file);
    assert.doesNotMatch(content, /fixture-wardrobe-snapshot-01/, file);
    assert.doesNotMatch(content, /preferredColors/, file);
    assert.doesNotMatch(content, /fitPreferences/, file);
  }
});
