// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Product entities.
//
// Derived 1:1 from js/products.js, which remains the source of truth
// (see data/schema-version.js SOURCE_OF_TRUTH). This module separates
// descriptive facts (name, category, colorway, styling profile) from
// commerce facts, which now live in their own entity (data/offers.js),
// and from brand-graph edges (data/brands.js / data/relationships.js
// MADE_BY), per docs/KNOWLEDGE_GRAPH_V1.md's entity model.
//
// `id` is preserved verbatim from js/products.js — every id already used
// in outfit `productId` references, sitemap-adjacent URLs, etc. stays
// stable across this migration, per the issue's "preserve current IDs
// when they are already stable" requirement.
//
// `profile.alternatives` is intentionally NOT carried onto the product
// record here — it becomes an ALTERNATIVE_TO relationship in
// data/relationships.js instead, so its confidence/verification state
// (see that file for why it's marked low-confidence) is explicit rather
// than being silently embedded in a product's own profile block.
//
// Record shape:
//   {
//     id: string,
//     name: string,
//     brandId: string|null,       // data/brands.js id
//     categoryId: string,         // data/taxonomies.js CATEGORY_IDS member
//     colorway: string|null,
//     image: string,
//     tags: string[],             // occasion display strings (validated against OCCASION_IDS)
//     matchType: 'Exact item'|'Similar option',
//     offerId: string,            // data/offers.js id
//     featuredInGuideIds: string[],
//     profile: {
//       type: string,
//       whyPeopleAsk: string,
//       bestFor: string[],
//       stylingDifficulty: string,
//       worksWith: string[],
//       avoid: string[],
//     } | null,
//     reviewStatus: 'direct_mapping',
//   }
// ============================================================
import { products as legacyProducts } from '../js/products.js';
import { slugify } from './lib/slugify.js';

export const products = Object.freeze(
  legacyProducts.map((product) =>
    Object.freeze({
      id: product.id,
      name: product.name,
      brandId: product.brand ? slugify(product.brand) : null,
      categoryId: slugify(product.category),
      colorway: product.colorway || null,
      image: product.image,
      tags: Object.freeze([...(product.tags || [])]),
      matchType: product.exactOrSimilar,
      offerId: product.id,
      featuredInGuideIds: Object.freeze([...(product.featuredInGuides || [])]),
      profile: product.profile
        ? Object.freeze({
            type: product.profile.type,
            whyPeopleAsk: product.profile.whyPeopleAsk,
            bestFor: Object.freeze([...(product.profile.bestFor || [])]),
            stylingDifficulty: product.profile.stylingDifficulty,
            worksWith: Object.freeze([...(product.profile.worksWith || [])]),
            avoid: Object.freeze([...(product.profile.avoid || [])]),
          })
        : null,
      reviewStatus: 'direct_mapping',
    })
  )
);

export function getProductById(id) {
  return products.find((p) => p.id === id) ?? null;
}

export default products;
