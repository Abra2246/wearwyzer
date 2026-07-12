#!/usr/bin/env node
// Lightweight static-asset/link check for every *.dc.html page and index.html.
// No dependencies, no build step — plain Node ESM, same style as
// scripts/validate-content-data.mjs.
//
// Usage:
//   node scripts/qa-static-site.mjs
//
// Exit code 0 = every local reference resolved.
// Exit code 1 = at least one local reference is missing or wrong-case.
//
// What it checks, scanning every top-level *.dc.html file and index.html:
//   - <link href="...">, <script src="...">, <img src="...">, <a href="...">
//     values that are local (relative) paths resolve to a real file on disk
//   - the check is case-sensitive even on a case-insensitive filesystem
//     (macOS), because GitHub Pages serves from a case-sensitive Linux host —
//     this is the exact class of bug that produced the dead SiteHeader/
//     SiteFooter files this repo already removed once
//   - <dc-import name="X"> resolves to a real "X.dc.html" file
//
// What it intentionally skips (not statically resolvable, or out of scope):
//   - absolute URLs (http://, https://, //), mailto:, tel:, javascript:
//   - in-page anchors (#foo) and bare "#"
//   - any attribute value containing "{{ }}" — those are dc-runtime template
//     bindings resolved at runtime from js/guides.js or js/products.js, and
//     are exactly what scripts/validate-content-data.mjs already validates

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HTML_FILES = readdirSync(ROOT).filter(
  (f) => f.endsWith('.dc.html') || f === 'index.html'
);

const ATTR_RE = /\b(?:href|src)\s*=\s*"([^"]*)"/g;
const DC_IMPORT_RE = /<dc-import\s+name="([^"]+)"/g;

function isSkippable(value) {
  if (!value) return true;
  if (value.includes('{{')) return true;
  if (/^(https?:)?\/\//i.test(value)) return true;
  if (/^(mailto|tel|javascript):/i.test(value)) return true;
  if (value.startsWith('#')) return true;
  return false;
}

function stripFragmentAndQuery(value) {
  return value.split('#')[0].split('?')[0];
}

// Case-sensitive existence check, since macOS's default filesystem is
// case-insensitive but GitHub Pages (Linux) is not.
function existsCaseSensitive(absPath) {
  if (!existsSync(absPath)) return false;
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  try {
    return readdirSync(dir).includes(base);
  } catch {
    return false;
  }
}

let errorCount = 0;
let checked = 0;

for (const file of HTML_FILES) {
  const text = readFileSync(path.join(ROOT, file), 'utf8');

  for (const match of text.matchAll(ATTR_RE)) {
    const raw = match[1];
    if (isSkippable(raw)) continue;
    const clean = stripFragmentAndQuery(raw);
    if (!clean) continue;
    checked += 1;
    const abs = path.join(ROOT, decodeURIComponent(clean));
    if (!existsCaseSensitive(abs)) {
      errorCount += 1;
      console.error(`✗ ${file}: broken reference "${raw}" → ${path.relative(ROOT, abs)} does not exist`);
    }
  }

  for (const match of text.matchAll(DC_IMPORT_RE)) {
    const name = match[1];
    checked += 1;
    const abs = path.join(ROOT, `${name}.dc.html`);
    if (!existsCaseSensitive(abs)) {
      errorCount += 1;
      console.error(`✗ ${file}: <dc-import name="${name}"> → ${name}.dc.html does not exist`);
    }
  }
}

console.log(`Checked ${checked} local references across ${HTML_FILES.length} pages.`);
if (errorCount > 0) {
  console.error(`\n✗ ${errorCount} broken static reference(s) found.`);
  process.exit(1);
}
console.log('\n✓ No broken local asset/link references.');
