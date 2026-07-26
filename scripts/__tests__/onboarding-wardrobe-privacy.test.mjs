import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const page = readFileSync(path.join(root, 'onboarding-wardrobe-intake.dc.html'), 'utf8');
const sitemap = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const siteNav = readFileSync(path.join(root, 'Site Nav.dc.html'), 'utf8');
const liveFeed = readFileSync(path.join(root, 'ops', 'live-feed.json'), 'utf8');
const status = readFileSync(path.join(root, 'ops', 'status.json'), 'utf8');

test('route is non-indexed and disabled unless the explicit fixture flag is present', () => {
  assert.match(page, /name="robots"\s+content="noindex, nofollow"/i);
  assert.match(page, /new URLSearchParams\(location\.search\)\.get\('ww_onboarding'\)/);
  assert.match(page, /enabled !== '1'/);
});

test('route remains absent from navigation and sitemap', () => {
  assert.doesNotMatch(sitemap, /onboarding-wardrobe-intake/);
  assert.doesNotMatch(siteNav, /onboarding-wardrobe-intake/);
});

test('URL and Mission Control feeds exclude private fixture payloads', () => {
  assert.doesNotMatch(page, /location\.search[^;]*(profile|wardrobe|size|consent)/i);
  for (const feed of [liveFeed, status]) {
    assert.doesNotMatch(feed, /fixture-onboarding-account-01/);
    assert.doesNotMatch(feed, /fixture-onboarding-profile/);
    assert.doesNotMatch(feed, /fixture-onboarding-wardrobe/);
    assert.doesNotMatch(feed, /preferredBrands/);
    assert.doesNotMatch(feed, /categorySizes/);
  }
});

test('interactive controls are native and status changes are announced accessibly', () => {
  assert.doesNotMatch(page, /onclick\s*=/i);
  assert.ok((page.match(/<button/g) || []).length >= 7);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-live="polite"/);
});

test('mobile styling prevents horizontal overflow and supports visible keyboard focus', () => {
  assert.match(page, /overflow-x:\s*hidden/);
  assert.match(page, /focus-visible/);
  assert.match(page, /@media\s*\(max-width:\s*620px\)/);
});

test('camera journey is synthetic and cannot request or upload real media', () => {
  assert.match(page, /Simulated camera/);
  assert.doesNotMatch(page, /getUserMedia|mediaDevices|type="file"|<input[^>]+\scapture(?:\s|=|>)/i);
  assert.doesNotMatch(page, /FileReader|readAsDataURL|canvas\.toDataURL/i);
});
