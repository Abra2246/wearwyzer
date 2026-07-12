// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Offer entities.
//
// ARCHITECTURE.md Recommendation 4 names the exact problem this entity
// exists to eventually solve: "affiliateUrl is a single hardcoded string
// per product... can't represent multiple retailers per product, can't
// track clicks, can't rotate/expire links." This v1 module does not
// solve that yet (it stays additive/1:1 with the current data — see
// docs/KNOWLEDGE_GRAPH_MIGRATION.md Phase 2 for the many-offers-per-
// product step) but it does give every product's commerce facts
// (price, retailer, affiliate link, match type) their own entity,
// separate from the product's descriptive facts (name, category,
// colorway), which is the prerequisite for that later phase.
//
// CONTENT INTEGRITY: price stays `null` and status stays "unpublished"
// unless js/products.js already has a confirmed price/link — this
// module never fabricates either, matching js/products.js's own header
// comment and CLAUDE.md's hard rule against fabricated commerce facts.
//
// Record shape:
//   {
//     id: string,                    // == productId (1:1 in v1, see migration doc)
//     productId: string,
//     retailerId: string|null,       // data/retailers.js id, null if unset
//     price: number|null,
//     priceStatus: 'tbd'|'confirmed',
//     affiliateUrl: string|null,     // null (not ""), unset until a real link exists
//     matchType: 'Exact item'|'Similar option',
//     lastChecked: string|null,      // ISO date string, null if never verified
//     status: 'published'|'unpublished',
//     reviewStatus: 'derived',
//   }
// ============================================================
import { products as legacyProducts } from '../js/products.js';
import { slugify } from './lib/slugify.js';

export const offers = Object.freeze(
  legacyProducts.map((product) =>
    Object.freeze({
      id: product.id,
      productId: product.id,
      retailerId: product.retailer ? slugify(product.retailer) : null,
      price: product.price ?? null,
      priceStatus: product.priceStatus,
      affiliateUrl: product.affiliateUrl ? product.affiliateUrl : null,
      matchType: product.exactOrSimilar,
      lastChecked: product.lastChecked ? product.lastChecked : null,
      status: product.affiliateUrl ? 'published' : 'unpublished',
      reviewStatus: 'derived',
    })
  )
);

export function getOfferById(id) {
  return offers.find((o) => o.id === id) ?? null;
}

export function getOfferByProductId(productId) {
  return offers.find((o) => o.productId === productId) ?? null;
}

export default offers;
