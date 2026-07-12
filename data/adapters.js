// ============================================================
// WEARWYZER KNOWLEDGE GRAPH — Compatibility adapter layer.
//
// Produces the *current* js/products.js and js/guides.js page contracts
// from the new data/ modules, so the two can be compared field-by-field
// (see scripts/compare-legacy-adapter.mjs). Per the issue scope, this is
// for comparison and future migration only — no `.dc.html` page is
// switched to read from these adapters in this change. If every
// existing page still imports directly from js/products.js /
// js/guides.js, that's correct; this file is not wired into any page.
//
// Reconstruction is intentionally *semantically* equivalent, not
// necessarily byte-identical: legacy records use "" / [] / omitted-key
// interchangeably to mean "no value" (compare the fully-fleshed guide
// objects against the sparse `coming-soon-1` placeholder in
// js/guides.js, which omits keys like `verdict`/`outfits`/`styleNotes`
// entirely rather than setting them empty). The adapters always emit an
// explicit empty value instead of omitting the key. This is a
// deliberate, documented difference — see
// docs/CURRENT_DATA_TO_GRAPH_MAPPING.md — not a defect, and
// scripts/compare-legacy-adapter.mjs's diff treats empty/omitted as
// equivalent so it doesn't drown real differences in noise.
// ============================================================
import { products, getProductById } from './products.js';
import { guides } from './guides.js';
import { outfits } from './outfits.js';
import { getOfferByProductId } from './offers.js';
import { getBrandById } from './brands.js';
import { getRetailerById } from './retailers.js';
import { CATEGORIES } from './taxonomies.js';
import { relationships } from './relationships.js';

function categoryName(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId)?.name ?? categoryId ?? '';
}

export function toLegacyProducts() {
  return products.map((product) => {
    const offer = getOfferByProductId(product.id);
    const brand = product.brandId ? getBrandById(product.brandId) : null;
    const retailer = offer?.retailerId ? getRetailerById(offer.retailerId) : null;
    const alternatives = relationships
      .filter((r) => r.predicate === 'ALTERNATIVE_TO' && r.subjectType === 'product' && r.subjectId === product.id)
      .map((r) => r.objectId);

    const legacy = {
      id: product.id,
      name: product.name,
      brand: brand ? brand.name : '',
      category: categoryName(product.categoryId),
      colorway: product.colorway ?? '',
      image: product.image,
      price: offer ? offer.price : null,
      priceStatus: offer ? offer.priceStatus : 'tbd',
      retailer: retailer ? retailer.name : '',
      affiliateUrl: offer?.affiliateUrl ?? '',
      exactOrSimilar: product.matchType,
      tags: [...product.tags],
      featuredInGuides: [...product.featuredInGuideIds],
      lastChecked: offer?.lastChecked ?? '',
    };

    if (product.profile) {
      legacy.profile = {
        type: product.profile.type,
        whyPeopleAsk: product.profile.whyPeopleAsk,
        bestFor: [...product.profile.bestFor],
        stylingDifficulty: product.profile.stylingDifficulty,
        worksWith: [...product.profile.worksWith],
        avoid: [...product.profile.avoid],
        alternatives,
      };
    }

    return legacy;
  });
}

export function toLegacyGuides() {
  return guides.map((guide) => {
    const heroProduct = guide.heroProductId ? getProductById(guide.heroProductId) : null;
    const guideOutfits = outfits.filter((o) => o.guideId === guide.id);

    return {
      id: guide.id,
      title: guide.title,
      slug: guide.slug ?? '',
      productName: heroProduct ? heroProduct.name : 'TBD',
      brand: guide.brandId ? getBrandById(guide.brandId)?.name ?? '' : '',
      colorway: guide.colorway ?? '',
      category: guide.categoryId ? categoryName(guide.categoryId) : '',
      verdict: guide.verdict ?? '',
      description: guide.description ?? '',
      coverImage: guide.coverImage ?? '',
      slideImages: guide.media.slides.map((s) => ({ src: s.src, label: s.label })),
      outfitCount: guide.outfitCount,
      bestFor: guide.bestForSummary ?? '',
      outfits: guideOutfits.map((outfit) => ({
        name: outfit.name,
        when: outfit.when ?? '',
        items: outfit.items.map((item) => ({
          name: item.label,
          productId: item.productId ?? undefined,
        })),
        why: outfit.why ?? '',
      })),
      styleNotes: [...guide.styleNotes],
      relatedProducts: [...guide.relatedProductIds],
      instagramUrl: guide.instagramUrl ?? '',
      publishedDate: guide.publishedDate ?? '',
      tags: [...guide.tags],
      comingSoon: guide.comingSoon,
    };
  });
}

export default { toLegacyProducts, toLegacyGuides };
