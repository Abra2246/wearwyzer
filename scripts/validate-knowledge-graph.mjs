#!/usr/bin/env node
// Validates the additive Knowledge Graph v1 foundation under data/
// against docs/KNOWLEDGE_GRAPH_V1.md. No dependencies, no build step —
// plain Node ESM, same style as scripts/validate-content-data.mjs.
//
// Usage:
//   node scripts/validate-knowledge-graph.mjs
//
// Exit code 0 = no structural errors (warnings may still be printed).
// Exit code 1 = at least one structural error was found.
//
// Structural checks (cause a non-zero exit):
//   - unique ids within every entity type (brands, retailers, offers,
//     products, outfits, guides, collections)
//   - unique slugs within every entity type that has one (guides)
//   - every id reference between entities resolves (brandId, retailerId,
//     categoryId, offerId, productId, guideId, outfitId)
//   - categoryId/tags are approved taxonomy ids (data/taxonomies.js)
//   - offer priceStatus/status/matchType are approved vocabulary values
//   - every relationship's predicate/confidence/verificationStatus is
//     from the approved vocabulary
//   - every relationship's subjectType/objectType is a known entity type
//     and subjectId/objectId resolves within that type
//   - every outfit item either resolves to a real productId or carries
//     an explicit editorialLabel (never both null, never both set)
//   - no duplicate normalized relationships (same predicate + subject +
//     object more than once)
//   - no self-alternative relationships (ALTERNATIVE_TO subject == object)
//   - no circular REPLACES chains
//   - unknown commerce facts stay null/unpublished: priceStatus "tbd"
//     implies price is null; offer status "published" implies a real
//     affiliateUrl; status "unpublished" implies no affiliateUrl
//
// Warning-only checks (printed, do not affect the exit code):
//   - a relationship that is confidence "editorial"/"verified" but whose
//     verificationStatus is not "verified" (unusual combination worth a
//     human look, not necessarily wrong)
//   - public recommendation eligibility summary (informational — how
//     many relationships would/would not surface on a future public
//     recommendation feature, per isPubliclyRecommendable())

import { brands } from '../data/brands.js';
import { retailers } from '../data/retailers.js';
import { offers } from '../data/offers.js';
import { products } from '../data/products.js';
import { outfits } from '../data/outfits.js';
import { guides } from '../data/guides.js';
import { collections } from '../data/collections.js';
import { relationships } from '../data/relationships.js';
import { slugify } from '../data/lib/slugify.js';
import {
  CATEGORY_IDS,
  OCCASION_IDS,
  TAG_IDS,
  MATCH_TYPES,
  OFFER_STATUSES,
  PRICE_STATUSES,
  RELATIONSHIP_PREDICATES,
  CONFIDENCE_LEVELS,
  VERIFICATION_STATUSES,
  ENTITY_TYPES,
  isPubliclyRecommendable,
} from '../data/taxonomies.js';

const errors = [];
const warnings = [];

const ENTITY_COLLECTIONS = {
  brand: brands,
  retailer: retailers,
  offer: offers,
  product: products,
  outfit: outfits,
  guide: guides,
  collection: collections,
};

const idIndex = {};
for (const type of ENTITY_TYPES) {
  idIndex[type] = new Set(ENTITY_COLLECTIONS[type].map((r) => r.id));
}

function resolves(type, id) {
  if (id === null || id === undefined) return true; // nullable refs are allowed; presence is checked elsewhere
  return idIndex[type]?.has(id) ?? false;
}

// ---- 1. unique ids within every entity type ----------------------------

for (const type of ENTITY_TYPES) {
  const seen = new Set();
  for (const record of ENTITY_COLLECTIONS[type]) {
    if (seen.has(record.id)) {
      errors.push(`Duplicate ${type} id: "${record.id}"`);
    }
    seen.add(record.id);
  }
}

// ---- 2. unique slugs within entity type (guides) ------------------------

{
  const seenSlugs = new Set();
  for (const guide of guides) {
    if (!guide.slug) continue; // null slug is allowed (e.g. comingSoon placeholder)
    if (seenSlugs.has(guide.slug)) {
      errors.push(`Duplicate guide slug: "${guide.slug}"`);
    }
    seenSlugs.add(guide.slug);
  }
}

// ---- 3. entity reference resolution + approved taxonomy ids ------------

for (const product of products) {
  if (!resolves('brand', product.brandId)) {
    errors.push(`Product "${product.id}" brandId "${product.brandId}" does not resolve to a brand`);
  }
  if (!CATEGORY_IDS.has(product.categoryId)) {
    errors.push(`Product "${product.id}" categoryId "${product.categoryId}" is not an approved category`);
  }
  if (!resolves('offer', product.offerId)) {
    errors.push(`Product "${product.id}" offerId "${product.offerId}" does not resolve to an offer`);
  }
  if (!MATCH_TYPES.includes(product.matchType)) {
    errors.push(`Product "${product.id}" matchType "${product.matchType}" is not an approved match type`);
  }
  for (const guideId of product.featuredInGuideIds) {
    if (!resolves('guide', guideId)) {
      errors.push(`Product "${product.id}" featuredInGuideIds references "${guideId}", which does not resolve to a guide`);
    }
  }
}

// Tag validation is against display-name-derived taxonomy ids; compare by
// slugified value so "Business casual" matches the "business-casual" term.
for (const product of products) {
  for (const tag of product.tags) {
    if (!OCCASION_IDS.has(slugify(tag))) {
      errors.push(`Product "${product.id}" tag "${tag}" is not an approved occasion`);
    }
  }
}

for (const offer of offers) {
  if (!resolves('product', offer.productId)) {
    errors.push(`Offer "${offer.id}" productId "${offer.productId}" does not resolve to a product`);
  }
  if (!resolves('retailer', offer.retailerId)) {
    errors.push(`Offer "${offer.id}" retailerId "${offer.retailerId}" does not resolve to a retailer`);
  }
  if (!PRICE_STATUSES.includes(offer.priceStatus)) {
    errors.push(`Offer "${offer.id}" priceStatus "${offer.priceStatus}" is not an approved price status`);
  }
  if (!OFFER_STATUSES.includes(offer.status)) {
    errors.push(`Offer "${offer.id}" status "${offer.status}" is not an approved offer status`);
  }
  if (!MATCH_TYPES.includes(offer.matchType)) {
    errors.push(`Offer "${offer.id}" matchType "${offer.matchType}" is not an approved match type`);
  }
  // ---- unknown commerce facts stay null/unpublished, never fabricated ----
  if (offer.priceStatus === 'tbd' && offer.price !== null) {
    errors.push(`Offer "${offer.id}" has priceStatus "tbd" but a non-null price (${offer.price}) — price must be null until confirmed`);
  }
  if (offer.status === 'published' && !offer.affiliateUrl) {
    errors.push(`Offer "${offer.id}" has status "published" but no affiliateUrl`);
  }
  if (offer.status === 'unpublished' && offer.affiliateUrl) {
    errors.push(`Offer "${offer.id}" has status "unpublished" but a non-null affiliateUrl — should be "published"`);
  }
}

for (const outfit of outfits) {
  if (!resolves('guide', outfit.guideId)) {
    errors.push(`Outfit "${outfit.id}" guideId "${outfit.guideId}" does not resolve to a guide`);
  }
  for (const item of outfit.items) {
    const hasProduct = Boolean(item.productId);
    const hasEditorialLabel = Boolean(item.editorialLabel);
    if (!hasProduct && !hasEditorialLabel) {
      errors.push(`Outfit "${outfit.id}" item "${item.label}" has neither a resolving productId nor an editorialLabel`);
    }
    if (hasProduct && hasEditorialLabel) {
      errors.push(`Outfit "${outfit.id}" item "${item.label}" has both a productId and an editorialLabel — should be exactly one`);
    }
    if (hasProduct && !resolves('product', item.productId)) {
      errors.push(`Outfit "${outfit.id}" item "${item.label}" productId "${item.productId}" does not resolve to a product`);
    }
  }
}

for (const guide of guides) {
  if (!resolves('brand', guide.brandId)) {
    errors.push(`Guide "${guide.id}" brandId "${guide.brandId}" does not resolve to a brand`);
  }
  if (guide.categoryId && !CATEGORY_IDS.has(guide.categoryId)) {
    errors.push(`Guide "${guide.id}" categoryId "${guide.categoryId}" is not an approved category`);
  }
  if (!resolves('product', guide.heroProductId)) {
    errors.push(`Guide "${guide.id}" heroProductId "${guide.heroProductId}" does not resolve to a product`);
  }
  for (const outfitId of guide.outfitIds) {
    if (!resolves('outfit', outfitId)) {
      errors.push(`Guide "${guide.id}" outfitIds references "${outfitId}", which does not resolve to an outfit`);
    }
  }
  for (const productId of guide.relatedProductIds) {
    if (!resolves('product', productId)) {
      errors.push(`Guide "${guide.id}" relatedProductIds references "${productId}", which does not resolve to a product`);
    }
  }
  for (const tag of guide.tags) {
    if (!TAG_IDS.has(slugify(tag))) {
      errors.push(`Guide "${guide.id}" tag "${tag}" is not an approved category or occasion`);
    }
  }
  if (!guide.comingSoon && !guide.slug) {
    errors.push(`Published guide "${guide.id}" has no slug`);
  }
}

for (const collection of collections) {
  for (const productId of collection.productIds || []) {
    if (!resolves('product', productId)) {
      errors.push(`Collection "${collection.id}" productIds references "${productId}", which does not resolve to a product`);
    }
  }
  for (const guideId of collection.guideIds || []) {
    if (!resolves('guide', guideId)) {
      errors.push(`Collection "${collection.id}" guideIds references "${guideId}", which does not resolve to a guide`);
    }
  }
}

// ---- 4. relationship vocabulary + reference resolution ------------------

const normalizedSeen = new Set();

for (const rel of relationships) {
  if (!RELATIONSHIP_PREDICATES.includes(rel.predicate)) {
    errors.push(`Relationship "${rel.id}" has unapproved predicate "${rel.predicate}"`);
  }
  if (!CONFIDENCE_LEVELS.includes(rel.confidence)) {
    errors.push(`Relationship "${rel.id}" has unapproved confidence "${rel.confidence}"`);
  }
  if (!VERIFICATION_STATUSES.includes(rel.verificationStatus)) {
    errors.push(`Relationship "${rel.id}" has unapproved verificationStatus "${rel.verificationStatus}"`);
  }
  if (!ENTITY_TYPES.includes(rel.subjectType)) {
    errors.push(`Relationship "${rel.id}" has unapproved subjectType "${rel.subjectType}"`);
  } else if (!resolves(rel.subjectType, rel.subjectId)) {
    errors.push(`Relationship "${rel.id}" subject ${rel.subjectType}:"${rel.subjectId}" does not resolve`);
  }
  if (!ENTITY_TYPES.includes(rel.objectType)) {
    errors.push(`Relationship "${rel.id}" has unapproved objectType "${rel.objectType}"`);
  } else if (!resolves(rel.objectType, rel.objectId)) {
    errors.push(`Relationship "${rel.id}" object ${rel.objectType}:"${rel.objectId}" does not resolve`);
  }

  // ---- no duplicate normalized relationships ----
  const normalizedKey = `${rel.predicate}:${rel.subjectType}:${rel.subjectId}:${rel.objectType}:${rel.objectId}`;
  if (normalizedSeen.has(normalizedKey)) {
    errors.push(`Duplicate normalized relationship: ${normalizedKey}`);
  }
  normalizedSeen.add(normalizedKey);

  // ---- no self-alternative relationships ----
  if (rel.predicate === 'ALTERNATIVE_TO' && rel.subjectType === rel.objectType && rel.subjectId === rel.objectId) {
    errors.push(`Relationship "${rel.id}" is a self-alternative (ALTERNATIVE_TO subject == object)`);
  }

  if (rel.verificationStatus !== 'verified' && ['editorial', 'verified'].includes(rel.confidence)) {
    warnings.push(
      `Relationship "${rel.id}" has confidence "${rel.confidence}" but verificationStatus "${rel.verificationStatus}" — unusual combination, worth a human check`
    );
  }
}

// ---- 5. no circular REPLACES chains -------------------------------------

{
  const replacesEdges = relationships.filter((r) => r.predicate === 'REPLACES');
  const adjacency = new Map();
  for (const rel of replacesEdges) {
    const from = `${rel.subjectType}:${rel.subjectId}`;
    const to = `${rel.objectType}:${rel.objectId}`;
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  let cyclic = false;

  function visit(node) {
    color.set(node, GRAY);
    for (const next of adjacency.get(node) || []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        cyclic = true;
      } else if (c === WHITE) {
        visit(next);
      }
    }
    color.set(node, BLACK);
  }

  for (const node of adjacency.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) visit(node);
  }

  if (cyclic) {
    errors.push('Circular REPLACES chain detected among relationships');
  }
}

// ---- 6. public recommendation eligibility summary (informational) ------

{
  const eligible = relationships.filter(isPubliclyRecommendable).length;
  const ineligible = relationships.length - eligible;
  warnings.push(
    `Public recommendation eligibility: ${eligible} of ${relationships.length} relationships are eligible ` +
      `(${ineligible} excluded for being draft/stale/rejected or below "editorial" confidence)`
  );
}

// ---- report --------------------------------------------------------------

console.log(
  `Checked ${brands.length} brands, ${retailers.length} retailers, ${offers.length} offers, ` +
    `${products.length} products, ${outfits.length} outfits, ${guides.length} guides, ` +
    `${collections.length} collections, ${relationships.length} relationships.\n`
);

if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log('  - ' + w));
  console.log('');
}

if (errors.length) {
  console.log(`✗ ${errors.length} structural error(s):`);
  errors.forEach((e) => console.log('  - ' + e));
  console.log('\nFAILED — fix the structural errors above.');
  process.exit(1);
} else {
  console.log('✓ No structural errors.');
  process.exit(0);
}
