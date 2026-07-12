#!/usr/bin/env node
// Validates js/guides.js and js/products.js against each other and against
// the filesystem. No dependencies, no build step — plain Node ESM.
//
// Usage:
//   node scripts/validate-content-data.mjs
//
// Exit code 0 = no structural errors (warnings may still be printed).
// Exit code 1 = at least one structural error was found.
//
// Structural checks (cause a non-zero exit):
//   - every guide outfit item's productId exists in js/products.js
//   - every guide's relatedProducts entry exists in js/products.js
//   - every product's featuredInGuides entry exists in js/guides.js
//   - every published (non-comingSoon) guide has a non-empty slug
//   - every published guide's slug points to a real file on disk
//   - no duplicate product ids
//   - no duplicate guide ids
//
// Warning-only checks (printed, do not affect the exit code):
//   - product-guide relationship asymmetry: a product's featuredInGuides
//     lists a guide whose relatedProducts doesn't list the product back
//     (or vice versa), or a guide outfit uses a productId that isn't in
//     that guide's own relatedProducts (dead "Shop ↓" anchor). This is a
//     data-quality signal, not a broken link, so it's a warning rather
//     than a hard failure — it already flags 4 known, pre-existing gaps
//     in Guide #1 (js/guides.js) that are tracked as a follow-up, not
//     fixed by this script.
//   - semantic mismatches: a guide item's label shares no meaningful word
//     with the name of the product its productId resolves to. This is a
//     heuristic (word-token overlap) and can false-positive on items
//     where the label and product name are worded very differently but
//     are actually correct (e.g. "9060 'Breakfast Tea'" vs "New Balance
//     9060 'Breakfast Tea with Angora'") — always eyeball the warnings.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { guides } = await import(path.join(ROOT, 'js', 'guides.js'));
const { products } = await import(path.join(ROOT, 'js', 'products.js'));

const errors = [];
const warnings = [];

// ---- structural checks -----------------------------------------------

const productIds = new Set();
for (const p of products) {
  if (productIds.has(p.id)) errors.push(`Duplicate product id: "${p.id}"`);
  productIds.add(p.id);
}

const guideIds = new Set();
for (const g of guides) {
  if (guideIds.has(g.id)) errors.push(`Duplicate guide id: "${g.id}"`);
  guideIds.add(g.id);
}

for (const g of guides) {
  for (const outfit of g.outfits || []) {
    for (const item of outfit.items || []) {
      if (!productIds.has(item.productId)) {
        errors.push(
          `Guide "${g.id}" outfit "${outfit.name}": item "${item.name}" references ` +
          `productId "${item.productId}", which does not exist in js/products.js`
        );
      }
    }
  }
  for (const rp of g.relatedProducts || []) {
    if (!productIds.has(rp)) {
      errors.push(`Guide "${g.id}" relatedProducts references "${rp}", which does not exist in js/products.js`);
    }
  }
  if (!g.comingSoon) {
    if (!g.slug) {
      errors.push(`Published guide "${g.id}" has no slug`);
    } else if (!existsSync(path.join(ROOT, g.slug))) {
      errors.push(`Guide "${g.id}" slug "${g.slug}" does not point to an existing file`);
    }
  }
}

for (const p of products) {
  for (const gid of p.featuredInGuides || []) {
    if (!guideIds.has(gid)) {
      errors.push(`Product "${p.id}" featuredInGuides references "${gid}", which does not exist in js/guides.js`);
    }
  }
}

// ---- warning-only checks -----------------------------------------------

const byId = Object.fromEntries(products.map(p => [p.id, p]));
const guideById = Object.fromEntries(guides.map(g => [g.id, g]));

// Product <-> guide relationship symmetry.
for (const p of products) {
  for (const gid of p.featuredInGuides || []) {
    const g = guideById[gid];
    if (g && !(g.relatedProducts || []).includes(p.id)) {
      warnings.push(
        `Product "${p.id}" lists featuredInGuides "${gid}", but guide "${gid}".relatedProducts does not include "${p.id}"`
      );
    }
  }
}
for (const g of guides) {
  for (const pid of g.relatedProducts || []) {
    const p = byId[pid];
    if (p && !(p.featuredInGuides || []).includes(g.id)) {
      warnings.push(
        `Guide "${g.id}" lists relatedProducts "${pid}", but product "${pid}".featuredInGuides does not include "${g.id}"`
      );
    }
  }
}

// Outfit items should resolve to a card actually rendered on their own
// guide page (i.e. be present in that guide's relatedProducts).
for (const g of guides) {
  const rp = new Set(g.relatedProducts || []);
  for (const outfit of g.outfits || []) {
    for (const item of outfit.items || []) {
      if (productIds.has(item.productId) && !rp.has(item.productId)) {
        warnings.push(
          `Guide "${g.id}" outfit "${outfit.name}": item "${item.name}" (${item.productId}) is not in ` +
          `relatedProducts, so its "Shop ↓" link will not resolve to a visible card`
        );
      }
    }
  }
}

// Semantic mismatch: does the item label share a meaningful word with the
// resolved product's name?
const STOPWORDS = new Set(['the', 'a', 'an', 'in', 'with', 'and', 'or', 'of', 'blend', 'wash']);
function tokens(str) {
  return str
    .replace(/\([^)]*\)/g, ' ') // drop parenthetical brand/qualifier
    .replace(/['"™]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}
for (const g of guides) {
  for (const outfit of g.outfits || []) {
    for (const item of outfit.items || []) {
      const p = byId[item.productId];
      if (!p) continue; // already a structural error above
      const itemTokens = new Set(tokens(item.name));
      const productTokens = new Set(tokens(p.name));
      const overlap = [...itemTokens].some(t => productTokens.has(t));
      if (!overlap) {
        warnings.push(
          `Guide "${g.id}" outfit "${outfit.name}": item "${item.name}" -> productId "${item.productId}" ` +
          `resolves to "${p.name}", which shares no meaningful word with the item label — verify manually`
        );
      }
    }
  }
}

// ---- report -----------------------------------------------------------

console.log(`Checked ${guides.length} guides and ${products.length} products.\n`);

if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s):`);
  warnings.forEach(w => console.log('  - ' + w));
  console.log('');
}

if (errors.length) {
  console.log(`✗ ${errors.length} structural error(s):`);
  errors.forEach(e => console.log('  - ' + e));
  console.log('\nFAILED — fix the structural errors above.');
  process.exit(1);
} else {
  console.log('✓ No structural errors.');
  process.exit(0);
}
