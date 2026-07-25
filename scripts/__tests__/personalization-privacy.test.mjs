import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const page = readFileSync(path.join(root, 'personalization-prototype.dc.html'), 'utf8');
const liveFeed = readFileSync(path.join(root, 'ops', 'live-feed.json'), 'utf8');
const status = readFileSync(path.join(root, 'ops', 'status.json'), 'utf8');

test('prototype route is non-indexed and disabled unless the explicit fixture flag is present', () => {
  assert.match(page, /name="robots"\s+content="noindex, nofollow"/i);
  assert.match(page, /ww_personalization/);
  assert.match(page, /enabled !== '1'/);
});

test('Mission Control feeds contain no fixture profile or wardrobe contents', () => {
  for (const feed of [liveFeed, status]) {
    assert.doesNotMatch(feed, /fixture-user-menswear-01/);
    assert.doesNotMatch(feed, /owned-cream-tee/);
    assert.doesNotMatch(feed, /preferredColors/);
  }
});
