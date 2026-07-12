// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — approved vocabularies.
//
// Every controlled-vocabulary value used anywhere under data/ (category
// ids, occasion ids, relationship predicates, confidence levels,
// verification statuses, offer/match/review statuses) is defined here so
// scripts/validate-knowledge-graph.mjs has one place to check "is this
// value allowed" against, per docs/KNOWLEDGE_GRAPH_V1.md.
//
// CATEGORIES and OCCASIONS are derived from js/products.js's existing
// CATEGORIES/OCCASIONS constants rather than re-typed, so the graph's
// taxonomy can never silently drift from the values the live site
// already renders and filters on.
// ============================================================
import { CATEGORIES as LEGACY_CATEGORIES, OCCASIONS as LEGACY_OCCASIONS } from '../js/products.js';
import { slugify } from './lib/slugify.js';

function toTerm(name) {
  return Object.freeze({ id: slugify(name), name });
}

// Product/offer category taxonomy (e.g. "Sneakers", "Shirts", "Pants").
export const CATEGORIES = Object.freeze(LEGACY_CATEGORIES.map(toTerm));
export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

// Occasion/use-case taxonomy (e.g. "Business casual", "Travel").
export const OCCASIONS = Object.freeze(LEGACY_OCCASIONS.map(toTerm));
export const OCCASION_IDS = new Set(OCCASIONS.map((o) => o.id));

// Legacy compatibility note (see docs/CURRENT_DATA_TO_GRAPH_MAPPING.md):
// js/guides.js's `tags` field conflates category values (e.g. "Sneakers")
// and occasion values (e.g. "Travel") in a single array. Rather than
// silently failing validation on every existing guide, or fabricating a
// split that isn't in the source data, guide tags are validated against
// the union of both taxonomies. Product `tags` are occasion-only and are
// validated against OCCASION_IDS specifically.
export const TAG_IDS = new Set([...CATEGORY_IDS, ...OCCASION_IDS]);

// Product/offer "how exact is this recommendation" label. Kept as the
// exact strings already used throughout js/products.js and the live UI
// copy, rather than renamed to a code-style id, since these are also
// used verbatim as display text today.
export const MATCH_TYPES = Object.freeze(['Exact item', 'Similar option']);

// Commerce fact publication state (data/offers.js). An offer is
// "published" only once it has a real affiliateUrl — matches the live
// site's "Shop →" vs. "Link coming soon" behavior in js/products.js.
export const OFFER_STATUSES = Object.freeze(['published', 'unpublished']);

// Price confirmation state — identical vocabulary to the existing
// js/products.js `priceStatus` field.
export const PRICE_STATUSES = Object.freeze(['tbd', 'confirmed']);

// Relationship predicate vocabulary (data/relationships.js). Every
// relationship's `predicate` must be one of these.
export const RELATIONSHIP_PREDICATES = Object.freeze([
  'MADE_BY', // product -> brand
  'HAS_OFFER', // product -> offer
  'OFFERED_BY', // offer -> retailer
  'FEATURED_IN', // product -> guide
  'RELATED_TO', // guide -> product
  'CONTAINS_OUTFIT', // guide -> outfit
  'INCLUDES_PRODUCT', // outfit -> product
  'ALTERNATIVE_TO', // product -> product
  'REPLACES', // product -> product | outfit -> outfit | guide -> guide (none in v1 data; modeled for validator/migration forward-compatibility)
]);

// Relationship confidence vocabulary, ordered low -> high. A relationship
// derived directly from an explicit, currently-published editorial field
// (e.g. featuredInGuides) is "editorial", not "verified" — "verified"
// is reserved for facts that have gone through an explicit confirmation
// step (mirroring js/products.js's own price/priceStatus distinction).
export const CONFIDENCE_LEVELS = Object.freeze(['unverified', 'inferred', 'editorial', 'verified']);
export const CONFIDENCE_RANK = Object.freeze(
  Object.fromEntries(CONFIDENCE_LEVELS.map((level, i) => [level, i]))
);

// Relationship lifecycle/verification status vocabulary.
export const VERIFICATION_STATUSES = Object.freeze(['draft', 'verified', 'stale', 'rejected']);

// Data-quality classification used by the entity records under data/
// (`reviewStatus` field) and by docs/CURRENT_DATA_TO_GRAPH_MAPPING.md.
export const REVIEW_STATUSES = Object.freeze([
  'direct_mapping', // copied straight from the legacy field, no reinterpretation
  'derived', // computed from one or more legacy fields (e.g. brand entity from product.brand strings)
  'legacy_compat', // exists only to let the compatibility adapter reproduce the legacy shape
  'missing_canonical_data', // the graph has nowhere truthful to source this value from yet
  'ambiguous_review_required', // a human editor needs to resolve which interpretation is correct
]);

// Minimum confidence + required verification status for a relationship
// to be eligible for any *public-facing* recommendation surface (search,
// "related products", "you might also like" — none of which exist yet,
// see ROADMAP.md, but this is the gate they must use once they do).
// A relationship is publicly recommendable only if it is NOT draft,
// stale, or rejected, and its confidence is editorial or verified.
export function isPubliclyRecommendable(relationship) {
  if (!relationship) return false;
  if (relationship.verificationStatus !== 'verified') return false;
  return CONFIDENCE_RANK[relationship.confidence] >= CONFIDENCE_RANK.editorial;
}

export const ENTITY_TYPES = Object.freeze([
  'brand',
  'retailer',
  'offer',
  'product',
  'outfit',
  'guide',
  'collection',
]);

export default {
  CATEGORIES,
  CATEGORY_IDS,
  OCCASIONS,
  OCCASION_IDS,
  TAG_IDS,
  MATCH_TYPES,
  OFFER_STATUSES,
  PRICE_STATUSES,
  RELATIONSHIP_PREDICATES,
  CONFIDENCE_LEVELS,
  CONFIDENCE_RANK,
  VERIFICATION_STATUSES,
  REVIEW_STATUSES,
  ENTITY_TYPES,
  isPubliclyRecommendable,
};
