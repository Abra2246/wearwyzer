// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Brand entities.
//
// js/products.js has no `brand` entity today — brand is a plain string
// field on each product ("" meaning "any comparable brand works", per
// that file's own CONTENT INTEGRITY RULES comment). This module derives
// one Brand record per distinct non-empty brand string, so a brand can
// be referenced by id (data/relationships.js MADE_BY) instead of by
// repeating its display name.
//
// Nothing here is fabricated: a brand only exists in this list because
// at least one real product in js/products.js already names it. No
// brand metadata (website, founding info, etc.) is invented — those
// fields are explicit `null` per docs/CURRENT_DATA_TO_GRAPH_MAPPING.md's
// "missing canonical data" classification.
//
// Record shape:
//   {
//     id: string,            // stable, derived via slugify(name)
//     name: string,           // display name, verbatim from js/products.js
//     website: string|null,   // missing canonical data — always null in v1
//     productIds: string[],   // products.js ids that name this brand
//     reviewStatus: 'derived',
//   }
// ============================================================
import { products as legacyProducts } from '../js/products.js';
import { slugify } from './lib/slugify.js';

const byId = new Map();

for (const product of legacyProducts) {
  if (!product.brand) continue; // "" = "any comparable brand works", not a brand entity
  const id = slugify(product.brand);
  if (!byId.has(id)) {
    byId.set(id, {
      id,
      name: product.brand,
      website: null,
      productIds: [],
      reviewStatus: 'derived',
    });
  }
  byId.get(id).productIds.push(product.id);
}

export const brands = Object.freeze(
  [...byId.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((brand) => Object.freeze({ ...brand, productIds: Object.freeze(brand.productIds) }))
);

export function getBrandById(id) {
  return brands.find((b) => b.id === id) ?? null;
}

export default brands;
