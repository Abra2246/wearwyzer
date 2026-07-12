// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Guide entities.
//
// Derived 1:1 from js/guides.js, which remains the source of truth.
// Outfits are no longer embedded inline — they're addressable entities
// in data/outfits.js, referenced here by id (`outfitIds`) and via the
// CONTAINS_OUTFIT relationship in data/relationships.js.
//
// `heroProductId` is a *derived* field (see
// docs/CURRENT_DATA_TO_GRAPH_MAPPING.md): js/guides.js describes each
// guide's hero item with free-text (`productName`, `brand`, `colorway`,
// `category`) rather than a product reference. Rather than fuzzy-match
// that text against product names (unreliable, and CLAUDE.md forbids
// guessing), this module computes it mechanically: the one productId
// that appears in every one of the guide's outfits, if there is exactly
// one. That holds for all three published guides today (each is built
// around one hero sneaker) and resolves to `null` — not a guess — for
// any guide where it doesn't hold (e.g. the comingSoon placeholder,
// which has no outfits at all).
//
// Record shape:
//   {
//     id: string,
//     title: string,
//     slug: string|null,
//     heroProductId: string|null,  // derived, see above
//     brandId: string|null,
//     categoryId: string,
//     colorway: string|null,
//     verdict: string|null,
//     description: string|null,
//     coverImage: string|null,
//     outfitIds: string[],
//     outfitCount: number,        // derived: outfitIds.length, not copied from the legacy hardcoded count
//     relatedProductIds: string[],
//     styleNotes: string[],
//     bestForSummary: string|null, // free-text summary, e.g. "Business casual · Everyday · Date night · Travel"
//     media: { slides: Array<{ src: string, label: string }> },
//     instagramUrl: string|null,
//     publishedDate: string|null,
//     tags: string[],             // legacy field mixes category + occasion values, see data/taxonomies.js TAG_IDS
//     comingSoon: boolean,
//     reviewStatus: 'direct_mapping'|'missing_canonical_data',
//   }
//
// `productName` from js/guides.js is deliberately NOT carried onto this
// record: in every published guide it is identical to
// getProductById(heroProductId).name, so keeping both would risk the two
// drifting apart. data/adapters.js reconstructs it from heroProductId.
// ============================================================
import { guides as legacyGuides } from '../js/guides.js';
import { outfits } from './outfits.js';
import { slugify } from './lib/slugify.js';

function deriveHeroProductId(guideId, guideOutfits) {
  if (!guideOutfits.length) return null;
  let common = null;
  for (const outfit of guideOutfits) {
    const ids = new Set(outfit.items.map((i) => i.productId).filter(Boolean));
    common = common === null ? ids : new Set([...common].filter((id) => ids.has(id)));
    if (common.size === 0) return null;
  }
  return common && common.size === 1 ? [...common][0] : null;
}

export const guides = Object.freeze(
  legacyGuides.map((guide) => {
    const guideOutfits = outfits.filter((o) => o.guideId === guide.id);
    return Object.freeze({
      id: guide.id,
      title: guide.title,
      slug: guide.slug || null,
      heroProductId: deriveHeroProductId(guide.id, guideOutfits),
      brandId: guide.brand ? slugify(guide.brand) : null,
      categoryId: guide.category ? slugify(guide.category) : null,
      colorway: guide.colorway || null,
      verdict: guide.verdict || null,
      description: guide.description || null,
      coverImage: guide.coverImage || null,
      outfitIds: Object.freeze(guideOutfits.map((o) => o.id)),
      outfitCount: guideOutfits.length,
      relatedProductIds: Object.freeze([...(guide.relatedProducts || [])]),
      styleNotes: Object.freeze([...(guide.styleNotes || [])]),
      bestForSummary: guide.bestFor || null,
      media: Object.freeze({
        slides: Object.freeze((guide.slideImages || []).map((s) => Object.freeze({ ...s }))),
      }),
      instagramUrl: guide.instagramUrl || null,
      publishedDate: guide.publishedDate || null,
      tags: Object.freeze([...(guide.tags || [])]),
      comingSoon: Boolean(guide.comingSoon),
      reviewStatus: guide.comingSoon ? 'missing_canonical_data' : 'direct_mapping',
    });
  })
);

export function getGuideById(id) {
  return guides.find((g) => g.id === id) ?? null;
}

export default guides;
