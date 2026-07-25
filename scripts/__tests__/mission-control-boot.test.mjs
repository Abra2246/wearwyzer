import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function sha384Base64(file) {
  return createHash('sha384').update(readFileSync(file)).digest('base64');
}

test('dc runtime boots from pinned local React assets with verified hashes', () => {
  const support = readFileSync(path.join(root, 'support.js'), 'utf8');
  const reactPath = path.join(root, 'vendor', 'react-18.3.1', 'react.production.min.js');
  const reactDomPath = path.join(root, 'vendor', 'react-18.3.1', 'react-dom.production.min.js');

  assert.match(support, /\.\/vendor\/react-18\.3\.1\/react\.production\.min\.js/);
  assert.match(support, /\.\/vendor\/react-18\.3\.1\/react-dom\.production\.min\.js/);
  assert.doesNotMatch(support, /unpkg\.com\/react@18\.3\.1/);
  assert.equal(sha384Base64(reactPath), 'DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z');
  assert.equal(sha384Base64(reactDomPath), 'gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1');
});

test('Mission Control retries a failed startup module instead of staying on Loading forever', () => {
  const html = readFileSync(path.join(root, 'mission-control.dc.html'), 'utf8');
  assert.match(html, /isFetching: true/);
  assert.match(html, /ops-live-refresh-state\.mjs\?boot=/);
  assert.match(html, /Dashboard startup failed; retrying automatically/);
  assert.match(html, /this\._initializeTimeout = setTimeout\(this\.initialize/);
});
