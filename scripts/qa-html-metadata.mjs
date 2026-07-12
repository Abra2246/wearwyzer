#!/usr/bin/env node
// Checks HTML metadata and unresolved template tokens on every *.dc.html
// page and index.html. No dependencies, no build step — plain Node ESM,
// same style as scripts/validate-content-data.mjs and scripts/qa-static-site.mjs.
//
// Usage:
//   node scripts/qa-html-metadata.mjs
//
// Exit code 0 = every page's metadata is valid.
// Exit code 1 = at least one page is missing required metadata, or a
//               metadata field contains an unresolved dc-runtime token.
//
// What it checks, scanning every top-level *.dc.html file and index.html:
//   - non-empty <title>
//   - non-empty <meta name="description"> for indexable pages (a page is
//     exempt if its own <meta name="robots" content="noindex" ...> is
//     present, or if it's a documented PARTIAL_COMPONENT — see below)
//   - the <html> tag declares a non-empty lang attribute
//   - no literal "{{ ... }}" dc-runtime template token inside the
//     metadata surface (<title>, every <meta content="...">, the
//     canonical <link href>, or an application/ld+json script body) —
//     unlike the page body, none of these are ever runtime-bound in this
//     codebase, so any "{{" there is a real, undeployable bug, not a
//     dynamic binding in progress
//
// A whole-file "every {{ has a matching }}" balance check was considered
// and dropped: several pages' data-dc-script blocks carry an HTML-encoded
// JSON data-props attribute (e.g. Site Nav.dc.html's
// data-props="{&quot;...&quot;:{...}}") where two unrelated JSON objects
// close adjacently, producing a legitimate "}}" with no matching "{{" —
// a whole-file count would false-positive on every existing page.
//
// What it intentionally skips:
//   - "{{ }}" bindings anywhere in the page body (nav links, guide
//     outfits, etc.) — those are resolved client-side by the dc-runtime
//     from js/guides.js / js/products.js at render time, exactly the
//     class of token scripts/qa-static-site.mjs already documents
//     skipping, and the runtime itself logs a console warning for any
//     that fail to resolve (see CLAUDE.md's "Verifying a change")
//
// Documented exceptions (the "safely handled by the runtime" allowance
// the task spec calls for):
//   - PARTIAL_COMPONENTS below: files that are never a standalone page —
//     only ever pulled in via <dc-import name="..."> by a real page — so
//     they carry no <title>/description of their own. Confirmed via
//     scripts/qa-static-site.mjs's <dc-import> resolution: only
//     "Site Nav" and "Site Footer" are import targets today.
//   - the <meta name="robots" content="noindex"> exemption above, which
//     covers 404.dc.html and the index.html redirect stub without
//     hardcoding filenames — any future noindex page gets the same
//     treatment automatically.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HTML_FILES = readdirSync(ROOT).filter(
  (f) => f.endsWith('.dc.html') || f === 'index.html'
);

// Imported chrome components — never served/linked as a standalone page,
// so they're exempt from the title/description requirements below.
const PARTIAL_COMPONENTS = new Set(['Site Nav.dc.html', 'Site Footer.dc.html']);

const TITLE_RE = /<title>([^<]*)<\/title>/i;
const HTML_TAG_RE = /<html([^>]*)>/i;
const LANG_ATTR_RE = /\blang="([^"]*)"/i;
const ROBOTS_NOINDEX_RE = /<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"/i;
const META_TAG_RE = /<meta\b[^>]*>/gi;
const META_CONTENT_RE = /\scontent="([^"]*)"/i;
const META_NAME_RE = /\sname="([^"]*)"/i;
const CANONICAL_RE = /<link[^>]*\brel="canonical"[^>]*\bhref="([^"]*)"/i;
const LDJSON_RE = /<script[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

let errorCount = 0;
let checked = 0;

function reportField(file, field, value) {
  if (value.includes('{{')) {
    errorCount += 1;
    console.error(`✗ ${file}: unresolved template token in ${field}: "${value}"`);
    return true;
  }
  return false;
}

for (const file of HTML_FILES) {
  checked += 1;
  const text = readFileSync(path.join(ROOT, file), 'utf8');
  const isPartial = PARTIAL_COMPONENTS.has(file);
  const isNoindex = ROBOTS_NOINDEX_RE.test(text);

  // ---- title ------------------------------------------------------------
  const titleMatch = text.match(TITLE_RE);
  const title = titleMatch ? titleMatch[1].trim() : '';
  if (!isPartial) {
    if (!title) {
      errorCount += 1;
      console.error(`✗ ${file}: missing or empty <title>`);
    } else {
      reportField(file, '<title>', title);
    }
  }

  // ---- lang ---------------------------------------------------------------
  const htmlTagMatch = text.match(HTML_TAG_RE);
  if (htmlTagMatch) {
    const langMatch = htmlTagMatch[1].match(LANG_ATTR_RE);
    if (!langMatch || !langMatch[1].trim()) {
      errorCount += 1;
      console.error(`✗ ${file}: <html> tag has no non-empty lang attribute`);
    }
  }

  // ---- meta description (indexable pages only) -------------------------
  let description = '';
  for (const metaTag of text.matchAll(META_TAG_RE)) {
    const nameMatch = metaTag[0].match(META_NAME_RE);
    if (!nameMatch || nameMatch[1] !== 'description') continue;
    const contentMatch = metaTag[0].match(META_CONTENT_RE);
    description = contentMatch ? contentMatch[1].trim() : '';
    break;
  }
  if (!isPartial && !isNoindex) {
    if (!description) {
      errorCount += 1;
      console.error(`✗ ${file}: missing or empty <meta name="description">`);
    } else {
      reportField(file, 'meta description', description);
    }
  } else if (description) {
    reportField(file, 'meta description', description);
  }

  // ---- remaining metadata surface: all other meta content, canonical, ----
  // ---- and JSON-LD bodies, regardless of indexability ---------------------
  for (const metaTag of text.matchAll(META_TAG_RE)) {
    const nameMatch = metaTag[0].match(META_NAME_RE);
    if (nameMatch && nameMatch[1] === 'description') continue; // already checked
    const contentMatch = metaTag[0].match(META_CONTENT_RE);
    if (!contentMatch) continue;
    reportField(file, `meta "${metaTag[0].slice(0, 60)}..."`, contentMatch[1]);
  }

  const canonicalMatch = text.match(CANONICAL_RE);
  if (canonicalMatch) {
    reportField(file, 'canonical link href', canonicalMatch[1]);
  }

  for (const ldMatch of text.matchAll(LDJSON_RE)) {
    reportField(file, 'application/ld+json body', ldMatch[1]);
  }
}

console.log(`Checked metadata on ${checked} pages.`);
if (errorCount > 0) {
  console.error(`\n✗ ${errorCount} metadata error(s) found.`);
  process.exit(1);
}
console.log('\n✓ No missing metadata or unresolved template tokens.');
