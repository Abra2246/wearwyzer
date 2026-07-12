// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Relationship edges.
//
// This is the graph's edge list: every relationship is computed here,
// programmatically, from the other data/ entity modules — none of these
// records are hand-typed. That's a deliberate choice, not just a style
// preference: hand-transcribing ~90 edges by reading js/guides.js would
// be exactly the kind of copy error class this whole graph exists to
// prevent (see docs/KNOWLEDGE_GRAPH_V1.md "why a graph"). Each edge
// below is derived from a field that already exists on a legacy record,
// so an edge exists in this list if and only if the corresponding fact
// exists in js/products.js or js/guides.js today.
//
// Record shape:
//   {
//     id: string,                 // `${predicate}:${subjectType}:${subjectId}:${objectType}:${objectId}`
//     predicate: string,          // data/taxonomies.js RELATIONSHIP_PREDICATES member
//     subjectType: string,        // data/taxonomies.js ENTITY_TYPES member
//     subjectId: string,
//     objectType: string,
//     objectId: string,
//     confidence: string,         // data/taxonomies.js CONFIDENCE_LEVELS member
//     verificationStatus: string, // data/taxonomies.js VERIFICATION_STATUSES member
//     notes: string|null,
//   }
//
// Confidence/verification rules applied below (see
// docs/KNOWLEDGE_GRAPH_V1.md "Confidence & verification rules"):
//   - A relationship derived from a field that is a *currently-published,
//     currently-rendered* fact on the live site (featuredInGuides,
//     relatedProducts, an outfit's own item list, brand/retailer
//     strings) is confidence "editorial", verificationStatus "verified"
//     — it is already live, not a draft or a guess.
//   - profile.alternatives is the one exception: js/products.js's own
//     comment on that field ("TODO: add real alternative shoe IDs as
//     they're covered") marks it incomplete at the source. Carrying it
//     forward as "editorial/verified" would overstate it, so it's
//     confidence "unverified", verificationStatus "draft" — which also
//     means isPubliclyRecommendable() correctly excludes it today. This
//     is not a fabricated downgrade; it's the source data's own caveat
//     made explicit and machine-checkable instead of living only in a
//     code comment.
// ============================================================
import { products } from './products.js';
import { guides } from './guides.js';
import { outfits } from './outfits.js';
import { offers } from './offers.js';
import { products as legacyProducts } from '../js/products.js';

// data/products.js intentionally does not carry profile.alternatives
// forward as a product field (see that module's header) — read it here,
// straight from the legacy source, only to build the ALTERNATIVE_TO
// edges below.
const LEGACY_ALTERNATIVES_BY_PRODUCT_ID = Object.fromEntries(
  legacyProducts
    .filter((p) => p.profile && Array.isArray(p.profile.alternatives) && p.profile.alternatives.length)
    .map((p) => [p.id, p.profile.alternatives])
);

function edge(predicate, subjectType, subjectId, objectType, objectId, confidence, verificationStatus, notes = null) {
  return Object.freeze({
    id: `${predicate}:${subjectType}:${subjectId}:${objectType}:${objectId}`,
    predicate,
    subjectType,
    subjectId,
    objectType,
    objectId,
    confidence,
    verificationStatus,
    notes,
  });
}

const relationshipList = [];

// MADE_BY: product -> brand
for (const product of products) {
  if (product.brandId) {
    relationshipList.push(
      edge('MADE_BY', 'product', product.id, 'brand', product.brandId, 'editorial', 'verified')
    );
  }
}

// HAS_OFFER: product -> offer (1:1 in v1, see data/offers.js)
for (const offer of offers) {
  relationshipList.push(
    edge('HAS_OFFER', 'product', offer.productId, 'offer', offer.id, 'editorial', 'verified')
  );
}

// OFFERED_BY: offer -> retailer
for (const offer of offers) {
  if (offer.retailerId) {
    relationshipList.push(
      edge('OFFERED_BY', 'offer', offer.id, 'retailer', offer.retailerId, 'editorial', 'verified')
    );
  }
}

// FEATURED_IN: product -> guide
for (const product of products) {
  for (const guideId of product.featuredInGuideIds) {
    relationshipList.push(
      edge('FEATURED_IN', 'product', product.id, 'guide', guideId, 'editorial', 'verified')
    );
  }
}

// RELATED_TO: guide -> product
for (const guide of guides) {
  for (const productId of guide.relatedProductIds) {
    relationshipList.push(
      edge('RELATED_TO', 'guide', guide.id, 'product', productId, 'editorial', 'verified')
    );
  }
}

// CONTAINS_OUTFIT: guide -> outfit
for (const outfit of outfits) {
  relationshipList.push(
    edge('CONTAINS_OUTFIT', 'guide', outfit.guideId, 'outfit', outfit.id, 'editorial', 'verified')
  );
}

// INCLUDES_PRODUCT: outfit -> product (only where the item resolved to a
// real product — items with only an editorialLabel produce no edge,
// per the issue's "outfit product references resolve or use an
// explicit editorial label" requirement).
for (const outfit of outfits) {
  for (const item of outfit.items) {
    if (item.productId) {
      relationshipList.push(
        edge('INCLUDES_PRODUCT', 'outfit', outfit.id, 'product', item.productId, 'editorial', 'verified')
      );
    }
  }
}

// ALTERNATIVE_TO: product -> product, sourced from js/products.js
// profile.alternatives. See file header for why this is low-confidence.
for (const product of products) {
  const legacyAlternatives = LEGACY_ALTERNATIVES_BY_PRODUCT_ID[product.id];
  if (!legacyAlternatives) continue;
  for (const alternativeId of legacyAlternatives) {
    if (alternativeId === product.id) continue; // no self-alternatives, even from source data
    relationshipList.push(
      edge(
        'ALTERNATIVE_TO',
        'product',
        product.id,
        'product',
        alternativeId,
        'unverified',
        'draft',
        "Source js/products.js profile.alternatives is marked incomplete at the field level " +
          '("TODO: add real alternative shoe IDs as they\'re covered") — not yet confirmed as a ' +
          'genuine styling alternative.'
      )
    );
  }
}

// De-duplicate normalized edges (same predicate+subject+object) — belt
// and suspenders alongside scripts/validate-knowledge-graph.mjs's own
// check, since the `id` scheme above already makes duplicates
// impossible to construct differently, but a legacy field could in
// principle list the same reference twice (e.g. a typo'd double entry
// in relatedProducts).
const seen = new Set();
const deduped = [];
for (const rel of relationshipList) {
  if (seen.has(rel.id)) continue;
  seen.add(rel.id);
  deduped.push(rel);
}

export const relationships = Object.freeze(deduped);

export function getRelationshipsBySubject(subjectType, subjectId) {
  return relationships.filter((r) => r.subjectType === subjectType && r.subjectId === subjectId);
}

export function getRelationshipsByObject(objectType, objectId) {
  return relationships.filter((r) => r.objectType === objectType && r.objectId === objectId);
}

export default relationships;
