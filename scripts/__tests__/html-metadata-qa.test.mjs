import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHtmlDocument } from '../qa-html-metadata.mjs';

const valid = `<!doctype html><html lang="en"><head>
  <title>WearWyzer</title>
  <meta name="description" content="Personal style guidance.">
  <link href="https://example.com/" rel="canonical">
</head><body><p>{{ runtimeCopy }}</p></body></html>`;

test('valid page passes while intentional body runtime bindings remain allowed', () => {
  assert.deepEqual(auditHtmlDocument('index.dc.html', valid), []);
});

test('missing title, description, and language fail with actionable file context', () => {
  const errors = auditHtmlDocument('broken.dc.html', '<html><head></head><body></body></html>');
  assert.equal(errors.length, 3);
  assert.ok(errors.every((error) => error.startsWith('broken.dc.html:')));
});

test('noindex pages do not require a description', () => {
  const html = '<html lang="en"><head><title>Private</title><meta content="noindex, nofollow" name="robots"></head></html>';
  assert.deepEqual(auditHtmlDocument('private.dc.html', html), []);
});

test('documented imported components do not require standalone title or description', () => {
  assert.deepEqual(
    auditHtmlDocument('Site Nav.dc.html', '<html lang="en"><body>Navigation</body></html>'),
    []
  );
});

test('unresolved tokens fail in title, meta content, canonical links, and JSON-LD', () => {
  const html = `<html lang="en"><head>
    <title>{{ title }}</title>
    <meta name="description" content="{{ description }}">
    <link rel="canonical" href="{{ canonical }}">
    <script type="application/ld+json">{"name":"{{ schemaName }}"}</script>
  </head></html>`;
  const errors = auditHtmlDocument('tokens.dc.html', html);
  assert.equal(errors.length, 4);
  assert.match(errors.join('\n'), /<title>/);
  assert.match(errors.join('\n'), /meta content/);
  assert.match(errors.join('\n'), /canonical href/);
  assert.match(errors.join('\n'), /JSON-LD/);
});
