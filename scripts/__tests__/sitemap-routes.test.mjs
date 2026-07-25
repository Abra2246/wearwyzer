import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every sitemap URL maps to a file included in the Pages artifact', () => {
  const xml = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.ok(locations.length > 0, 'sitemap must contain at least one URL');

  for (const location of locations) {
    const url = new URL(location);
    const relativePath = url.pathname === '/'
      ? 'index.html'
      : decodeURIComponent(url.pathname.replace(/^\/+/, ''));

    assert.ok(
      existsSync(path.join(root, relativePath)),
      `${location} does not map to a repository file (${relativePath})`,
    );
  }
});

test('sitemap never advertises clean HTML aliases that Pages does not build', () => {
  const xml = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname)
    .filter((pathname) => pathname !== '/');

  assert.ok(paths.every((pathname) => pathname.endsWith('.dc.html')));
});
