#!/usr/bin/env node
// Report-only comparison between the legacy js/products.js / js/guides.js
// contracts and data/adapters.js's reconstruction of them from the new
// data/*.js Knowledge Graph modules. See docs/KNOWLEDGE_GRAPH_V1.md
// "Source-of-truth boundaries" and docs/CURRENT_DATA_TO_GRAPH_MAPPING.md
// "Intentional adapter differences" for what this is checking and why.
//
// This script is intentionally NOT a pass/fail gate: it always exits 0.
// Its job is to print a diff for a human to read, not to block a build —
// per the issue scope, "a report-only comparison is acceptable and
// preferred" over switching any page to the adapter output.
//
// Usage:
//   node scripts/compare-legacy-adapter.mjs

import { products as legacyProducts } from '../js/products.js';
import { guides as legacyGuides } from '../js/guides.js';
import { toLegacyProducts, toLegacyGuides } from '../data/adapters.js';

// "" / [] / null / undefined are all treated as equivalent "no value" —
// see docs/CURRENT_DATA_TO_GRAPH_MAPPING.md "Intentional adapter
// differences" for why an omitted key and an explicit empty value are
// not meaningfully different here.
function deepNormalize(value) {
  if (Array.isArray(value)) {
    const arr = value.map(deepNormalize).filter((v) => v !== null);
    return arr.length ? arr : null;
  }
  if (value && typeof value === 'object') {
    const out = {};
    // Sort keys so the comparison is independent of property insertion
    // order — a real content match should never be reported as a diff
    // just because the adapter built an object's keys in a different
    // order than the legacy literal happens to declare them in.
    for (const k of Object.keys(value).sort()) {
      const nv = deepNormalize(value[k]);
      if (nv !== null) out[k] = nv;
    }
    return Object.keys(out).length ? out : null;
  }
  if (value === undefined || value === null || value === '') return null;
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(deepNormalize(a)) === JSON.stringify(deepNormalize(b));
}

function diffRecords(legacyList, adapterList, label) {
  const legacyById = new Map(legacyList.map((r) => [r.id, r]));
  const adapterById = new Map(adapterList.map((r) => [r.id, r]));
  const diffs = [];

  for (const id of new Set([...legacyById.keys(), ...adapterById.keys()])) {
    const legacy = legacyById.get(id);
    const adapter = adapterById.get(id);
    if (!legacy) {
      diffs.push({ id, field: '(whole record)', legacy: undefined, adapter: '(present)', issue: 'adapter produced a record with no legacy counterpart' });
      continue;
    }
    if (!adapter) {
      diffs.push({ id, field: '(whole record)', legacy: '(present)', adapter: undefined, issue: 'legacy record has no adapter counterpart' });
      continue;
    }
    const keys = new Set([...Object.keys(legacy), ...Object.keys(adapter)]);
    for (const key of keys) {
      if (!deepEqual(legacy[key], adapter[key])) {
        diffs.push({ id, field: key, legacy: legacy[key], adapter: adapter[key] });
      }
    }
  }

  console.log(`\n${label}: ${legacyList.length} legacy records, ${adapterList.length} adapter records.`);
  if (!diffs.length) {
    console.log(`✓ No field differences (after normalizing empty/omitted values as equivalent).`);
    return 0;
  }
  console.log(`⚠ ${diffs.length} field difference(s):`);
  for (const d of diffs) {
    console.log(`  - [${d.id}] ${d.field}: legacy=${JSON.stringify(d.legacy)} adapter=${JSON.stringify(d.adapter)}${d.issue ? ` (${d.issue})` : ''}`);
  }
  return diffs.length;
}

console.log('Comparing legacy js/products.js and js/guides.js against data/adapters.js reconstruction.');
console.log('(Report-only — see docs/CURRENT_DATA_TO_GRAPH_MAPPING.md for expected/intentional differences.)');

const productDiffCount = diffRecords(legacyProducts, toLegacyProducts(), 'Products');
const guideDiffCount = diffRecords(legacyGuides, toLegacyGuides(), 'Guides');

console.log(
  `\nTotal: ${productDiffCount} product diff(s), ${guideDiffCount} guide diff(s). ` +
    'This script does not fail the build — review any diffs above against ' +
    'docs/CURRENT_DATA_TO_GRAPH_MAPPING.md before treating the adapter as equivalent.'
);
process.exit(0);
