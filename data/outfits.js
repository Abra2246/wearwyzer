// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Outfit entities.
//
// js/guides.js embeds each guide's outfits as an inline array with no
// id of its own (just a `name`). This module gives every outfit a
// stable, globally unique id (`${guideId}--${slug(outfitName)}`) so it
// can be referenced from data/relationships.js (CONTAINS_OUTFIT) instead
// of only existing nested inside one guide record — this is the "Outfit
// Intelligence" gap ARCHITECTURE.md Recommendation 5 names ("outfits are
// hand-authored outfit combinations, not a queryable outfit graph").
// This module does not build the queryable/compatibility-rule graph
// that recommendation describes — it only gives today's hand-authored
// outfits addressable identity, which is the prerequisite for it.
//
// Every outfit's `items` entry keeps its original editorial label
// verbatim. `productId` is included only when it actually resolves
// against data/products.js; when it doesn't, `productId` is null and
// `editorialLabel` carries the original text, per the issue's
// requirement that "outfit product references resolve or use an
// explicit editorial label" (checked by
// scripts/validate-knowledge-graph.mjs). In the current data every item
// resolves, so this path is exercised by the validator's own
// self-test, not by real data — see docs/CURRENT_DATA_TO_GRAPH_MAPPING.md.
//
// Record shape:
//   {
//     id: string,
//     guideId: string,
//     name: string,
//     when: string|null,
//     why: string|null,
//     items: Array<{
//       label: string,
//       productId: string|null,
//       editorialLabel: string|null,  // set only when productId is null
//     }>,
//     reviewStatus: 'direct_mapping',
//   }
// ============================================================
import { guides as legacyGuides } from '../js/guides.js';
import { products as legacyProducts } from '../js/products.js';
import { slugify } from './lib/slugify.js';

const productIds = new Set(legacyProducts.map((p) => p.id));

export const outfits = Object.freeze(
  legacyGuides.flatMap((guide) =>
    (guide.outfits || []).map((outfit) =>
      Object.freeze({
        id: `${guide.id}--${slugify(outfit.name)}`,
        guideId: guide.id,
        name: outfit.name,
        when: outfit.when ?? null,
        why: outfit.why ?? null,
        items: Object.freeze(
          (outfit.items || []).map((item) => {
            const resolves = productIds.has(item.productId);
            return Object.freeze({
              label: item.name,
              productId: resolves ? item.productId : null,
              editorialLabel: resolves ? null : item.name,
            });
          })
        ),
        reviewStatus: 'direct_mapping',
      })
    )
  )
);

export function getOutfitById(id) {
  return outfits.find((o) => o.id === id) ?? null;
}

export function getOutfitsByGuideId(guideId) {
  return outfits.filter((o) => o.guideId === guideId);
}

export default outfits;
