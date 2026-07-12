// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Collection entities.
//
// A Collection is a curated, named group of products and/or guides
// (e.g. "Summer capsule", "New Balance edit") that is NOT the same
// thing as a Guide (a Guide is one editorial piece built around a hero
// product's outfits) or an Outfit (a single look). No such grouping
// exists anywhere in js/products.js, js/guides.js, or js/site-data.js
// today — the closest current concept is a guide's own relatedProducts
// list, which is guide-scoped, not a standalone entity.
//
// Per the issue's "do not invent missing data" rule, this module ships
// with zero records rather than fabricating example collections. It
// exists so the entity type and its validation rules (unique id, unique
// slug, resolvable productIds/guideIds) are defined up front, and so a
// future content change can add real collections without introducing a
// new module or a new validator code path.
//
// Record shape (none exist yet):
//   {
//     id: string,
//     name: string,
//     slug: string,
//     description: string|null,
//     productIds: string[],
//     guideIds: string[],
//     reviewStatus: 'missing_canonical_data',
//   }
// ============================================================

export const collections = Object.freeze([]);

export function getCollectionById(id) {
  return collections.find((c) => c.id === id) ?? null;
}

export default collections;
