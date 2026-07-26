import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const page = readFileSync(path.join(root, 'consent-correction-center.dc.html'), 'utf8');
const sitemap = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const siteNav = readFileSync(path.join(root, 'Site Nav.dc.html'), 'utf8');
const liveFeed = readFileSync(path.join(root, 'ops', 'live-feed.json'), 'utf8');
const status = readFileSync(path.join(root, 'ops', 'status.json'), 'utf8');

test('consent center route is non-indexed and disabled unless the explicit fixture flag is present', () => {
  assert.match(page, /name="robots"\s+content="noindex, nofollow"/i);
  assert.match(page, /ww_consent/);
  assert.match(page, /enabled !== '1'/);
  assert.match(page, /<html lang="en">/);
});

test('consent center route is unlinked from the sitemap and site navigation', () => {
  assert.doesNotMatch(sitemap, /consent-correction-center/);
  assert.doesNotMatch(siteNav, /consent-correction-center/);
});

test('Mission Control feeds contain no fixture account, profile, or wardrobe identifiers', () => {
  for (const feed of [liveFeed, status]) {
    assert.doesNotMatch(feed, /fixture-account-01/);
    assert.doesNotMatch(feed, /fixture-user-menswear-01/);
    assert.doesNotMatch(feed, /owned-cream-tee/);
    assert.doesNotMatch(feed, /preferred-fit-silhouette/);
  }
});

test('no private fixture payload is carried in the URL — only the boolean enable flag', () => {
  assert.doesNotMatch(page, /location\.search[^;]*profile/i);
  assert.doesNotMatch(page, /location\.search[^;]*wardrobe/i);
  assert.match(page, /new URLSearchParams\(location\.search\)\.get\('ww_consent'\)/);
});

test('every interactive control is a native, keyboard-operable element', () => {
  assert.doesNotMatch(page, /onclick\s*=/i);
  const buttonCount = (page.match(/<button/g) || []).length;
  assert.ok(buttonCount >= 7);
});
