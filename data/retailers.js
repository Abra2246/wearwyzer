// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Retailer entities.
//
// js/products.js has no `retailer` entity today — retailer is a plain
// string field on each product, separate from `brand` (ARCHITECTURE.md
// Recommendation 4 names this exact gap: "can't represent multiple
// retailers per product"). This module derives one Retailer record per
// distinct non-empty retailer string. In v1's data every retailer
// happens to equal its product's brand (brand sells direct) — that is
// a fact about the current 33 products, not an assumption baked into
// this module; a product with a real third-party retailer would produce
// a retailer entity distinct from its brand automatically.
//
// Record shape:
//   {
//     id: string,            // stable, derived via slugify(name)
//     name: string,           // display name, verbatim from js/products.js
//     website: string|null,   // missing canonical data — always null in v1
//     productIds: string[],   // products.js ids currently sold there
//     reviewStatus: 'derived',
//   }
// ============================================================
import { products as legacyProducts } from '../js/products.js';
import { slugify } from './lib/slugify.js';

const byId = new Map();

for (const product of legacyProducts) {
  if (!product.retailer) continue; // "" = retailer/affiliate program not yet set up
  const id = slugify(product.retailer);
  if (!byId.has(id)) {
    byId.set(id, {
      id,
      name: product.retailer,
      website: null,
      productIds: [],
      reviewStatus: 'derived',
    });
  }
  byId.get(id).productIds.push(product.id);
}

export const retailers = Object.freeze(
  [...byId.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((retailer) => Object.freeze({ ...retailer, productIds: Object.freeze(retailer.productIds) }))
);

export function getRetailerById(id) {
  return retailers.find((r) => r.id === id) ?? null;
}

export default retailers;
