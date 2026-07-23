#!/usr/bin/env node
// Dependency-free metadata QA for every top-level *.dc.html page and index.html.
// Runtime dc bindings are valid in page content and interactive attributes; this
// check intentionally limits unresolved-token failures to static metadata that
// search engines and link previews consume before the dc runtime executes.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const PARTIAL_COMPONENTS = new Set(['Site Nav.dc.html', 'Site Footer.dc.html']);
const TOKEN_RE = /\{\{[\s\S]*?\}\}/;

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : null;
}

function metaTags(text) {
  return [...text.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
}

function pushTokenError(errors, file, field, value) {
  if (TOKEN_RE.test(value)) {
    errors.push(`${file}: unresolved dc-runtime token in static ${field}`);
  }
}

export function auditHtmlDocument(file, text, {
  partialComponents = PARTIAL_COMPONENTS,
} = {}) {
  const errors = [];
  const isPartial = partialComponents.has(file);
  const htmlTag = text.match(/<html\b[^>]*>/i)?.[0] || null;
  const lang = htmlTag ? attribute(htmlTag, 'lang') : null;
  if (!htmlTag) {
    errors.push(`${file}: missing <html> element`);
  } else if (!lang?.trim()) {
    errors.push(`${file}: <html> has no non-empty lang attribute`);
  }

  const title = text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  if (!isPartial && !title) {
    errors.push(`${file}: missing or empty <title>`);
  } else if (title) {
    pushTokenError(errors, file, '<title>', title);
  }

  const metas = metaTags(text);
  const robots = metas.find((tag) => attribute(tag, 'name')?.toLowerCase() === 'robots');
  const noindex = /\bnoindex\b/i.test(attribute(robots || '', 'content') || '');
  const descriptionTag = metas.find(
    (tag) => attribute(tag, 'name')?.toLowerCase() === 'description'
  );
  const description = attribute(descriptionTag || '', 'content')?.trim() || '';
  if (!isPartial && !noindex && !description) {
    errors.push(`${file}: indexable page is missing a non-empty meta description`);
  }

  for (const tag of metas) {
    const content = attribute(tag, 'content');
    if (content !== null) pushTokenError(errors, file, 'meta content', content);
  }

  for (const match of text.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(match[0], 'rel')?.toLowerCase().split(/\s+/) || [];
    if (!rel.includes('canonical')) continue;
    pushTokenError(errors, file, 'canonical href', attribute(match[0], 'href') || '');
  }

  for (const match of text.matchAll(
    /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    pushTokenError(errors, file, 'JSON-LD', match[1]);
  }

  return errors;
}

export function discoverHtmlFiles(root = ROOT) {
  return readdirSync(root)
    .filter((file) => file === 'index.html' || file.endsWith('.dc.html'))
    .sort();
}

export function auditHtmlFiles(root = ROOT) {
  const files = discoverHtmlFiles(root);
  const errors = files.flatMap((file) =>
    auditHtmlDocument(file, readFileSync(path.join(root, file), 'utf8'))
  );
  return { files, errors };
}

function main() {
  const { files, errors } = auditHtmlFiles();
  console.log(`Checked HTML metadata on ${files.length} page files.`);
  if (errors.length) {
    for (const error of errors) console.error(`✗ ${error}`);
    console.error(`\n✗ ${errors.length} HTML metadata error(s) found.`);
    process.exitCode = 1;
    return;
  }
  console.log('✓ Titles, descriptions, language declarations, and static metadata bindings are valid.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
