import { products as canonicalProducts } from '../data/products.js';
import { offers as canonicalOffers } from '../data/offers.js';
import { products as productFacts } from '../js/products.js';

export const SCORING_VERSION = 'personalization-v1.0.0';
export const RECOMMENDATIONS = Object.freeze([
  'buy',
  'wait',
  'choose-alternative',
  'skip',
]);

const TOP_CATEGORIES = new Set(['shirts', 'hoodies']);
const BOTTOM_CATEGORIES = new Set(['pants']);
const FOOTWEAR_CATEGORIES = new Set(['shoes', 'sneakers']);
const OPTIONAL_CATEGORIES = new Set(['outerwear', 'accessories', 'watches', 'bags']);
const NEUTRAL_TOKENS = new Set([
  'black', 'white', 'cream', 'ivory', 'beige', 'navy', 'gray', 'grey',
  'brown', 'taupe', 'natural', 'stone', 'silver', 'gum',
]);

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function overlap(left = [], right = []) {
  const rightSet = new Set(right.map((value) => String(value).toLowerCase()));
  return left.filter((value) => rightSet.has(String(value).toLowerCase()));
}

function categoryRole(categoryId) {
  if (TOP_CATEGORIES.has(categoryId)) return 'top';
  if (BOTTOM_CATEGORIES.has(categoryId)) return 'bottom';
  if (FOOTWEAR_CATEGORIES.has(categoryId)) return 'footwear';
  if (OPTIONAL_CATEGORIES.has(categoryId)) return 'optional';
  return 'unknown';
}

function productRecord(productId, catalog, offers, facts) {
  const product = catalog.find((entry) => entry.id === productId);
  if (!product) return null;
  const offer = offers.find((entry) => entry.productId === productId) ?? null;
  const fact = facts.find((entry) => entry.id === productId) ?? null;
  return { ...product, offer, fact };
}

function paletteScore(candidate, profile) {
  const candidateColors = tokens(candidate.colorway);
  const preferred = tokens((profile.preferredColors || []).join(' '));
  if (overlap(candidateColors, preferred).length) return 95;
  if (candidateColors.some((color) => NEUTRAL_TOKENS.has(color))) return 82;
  return preferred.length ? 55 : 65;
}

function occasionScore(candidate, profile) {
  const desired = profile.commonOccasions || [];
  if (!desired.length) return 60;
  const matches = overlap(candidate.tags, desired);
  return clampScore(35 + (matches.length / desired.length) * 65);
}

function brandScore(candidate, profile) {
  const brand = String(candidate.fact?.brand || candidate.brandId || '').toLowerCase();
  const avoided = (profile.avoidedBrands || []).map((value) => value.toLowerCase());
  const favorite = (profile.favoriteBrands || []).map((value) => value.toLowerCase());
  if (avoided.includes(brand)) return 0;
  if (favorite.includes(brand)) return 100;
  return 65;
}

function wardrobePairingScore(candidate, wardrobeProducts) {
  if (!wardrobeProducts.length) return 0;
  const candidateTags = candidate.tags || [];
  const compatible = wardrobeProducts.filter((owned) => {
    const sharesOccasion = overlap(candidateTags, owned.tags || []).length > 0;
    const ownedColors = tokens(owned.colorway);
    const neutral = ownedColors.some((color) => NEUTRAL_TOKENS.has(color));
    return sharesOccasion || neutral;
  });
  return clampScore((compatible.length / wardrobeProducts.length) * 100);
}

function fitScore(candidate, profile) {
  const category = categoryRole(candidate.categoryId);
  const categoryPreference = profile.fitPreferences?.[category];
  if (candidate.fact?.fitGuidance && categoryPreference) return 85;
  if (candidate.fact?.fitGuidance) return 72;
  return categoryPreference ? 58 : 45;
}

function weightedScore(parts) {
  return clampScore(
    parts.palette * 0.2
      + parts.occasion * 0.2
      + parts.brand * 0.15
      + parts.wardrobePairing * 0.3
      + parts.fit * 0.15
  );
}

function rankOutfit(candidate, items, profile) {
  const sharedOccasions = items.reduce(
    (current, item) => overlap(current, item.tags || []),
    candidate.tags || []
  );
  const preferredMatches = overlap(sharedOccasions, profile.commonOccasions || []);
  const colorTokens = items.flatMap((item) => tokens(item.colorway));
  const neutralCount = colorTokens.filter((color) => NEUTRAL_TOKENS.has(color)).length;
  return clampScore(
    55
      + sharedOccasions.length * 7
      + preferredMatches.length * 8
      + Math.min(neutralCount, 3) * 3
  );
}

function buildOutfits(candidate, wardrobeProducts, profile) {
  const candidateRole = categoryRole(candidate.categoryId);
  const roleProducts = {
    top: wardrobeProducts.filter((item) => categoryRole(item.categoryId) === 'top'),
    bottom: wardrobeProducts.filter((item) => categoryRole(item.categoryId) === 'bottom'),
    footwear: wardrobeProducts.filter((item) => categoryRole(item.categoryId) === 'footwear'),
    optional: wardrobeProducts.filter((item) => categoryRole(item.categoryId) === 'optional'),
  };
  const required = ['top', 'bottom', 'footwear'];
  const missingRoles = required.filter((role) => role !== candidateRole && !roleProducts[role].length);
  if (missingRoles.length) return { outfits: [], missingRoles };

  const pools = required.map((role) =>
    role === candidateRole ? [candidate] : roleProducts[role]
  );
  const candidates = [];
  for (const top of pools[0]) {
    for (const bottom of pools[1]) {
      for (const footwear of pools[2]) {
        const base = [top, bottom, footwear];
        const optional = roleProducts.optional
          .map((item) => ({ item, score: rankOutfit(candidate, [...base, item], profile) }))
          .sort((a, b) => b.score - a.score)[0]?.item;
        const items = optional ? [...base, optional] : base;
        const key = items.map((item) => item.id).sort().join('|');
        candidates.push({
          id: `outfit-${key.replaceAll('|', '--')}`,
          itemIds: items.map((item) => item.id),
          ownedItemIds: items.filter((item) => item.id !== candidate.id).map((item) => item.id),
          prospectiveItemId: candidate.id,
          missingItems: [],
          score: rankOutfit(candidate, items, profile),
          reasonCodes: [
            'owned-first',
            overlap(candidate.tags, items.flatMap((item) => item.tags || [])).length
              ? 'shared-occasion'
              : 'neutral-palette',
          ],
        });
      }
    }
  }

  const unique = [...new Map(candidates.map((outfit) => [outfit.id, outfit])).values()]
    .filter((outfit) => outfit.score >= 68)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return { outfits: unique, missingRoles: [] };
}

function redundancyResult(candidate, wardrobeProducts) {
  const similar = wardrobeProducts
    .filter((owned) => owned.categoryId === candidate.categoryId)
    .map((owned) => {
      const colorOverlap = overlap(tokens(candidate.colorway), tokens(owned.colorway)).length;
      const tagOverlap = overlap(candidate.tags, owned.tags || []).length;
      const score = clampScore(50 + colorOverlap * 25 + tagOverlap * 8);
      return {
        productId: owned.id,
        score,
        reasonCodes: [
          'same-category',
          ...(colorOverlap ? ['similar-color'] : []),
          ...(tagOverlap ? ['shared-use-cases'] : []),
        ],
      };
    })
    .filter((entry) => entry.score >= 65)
    .sort((a, b) => b.score - a.score);

  return {
    score: similar[0]?.score ?? 0,
    similarItems: similar,
  };
}

function gapCoverage(candidate, wardrobeProducts, profile) {
  const role = categoryRole(candidate.categoryId);
  const ownsRole = wardrobeProducts.some((owned) => categoryRole(owned.categoryId) === role);
  const desiredOccasions = profile.commonOccasions || [];
  const coveredOccasions = new Set(wardrobeProducts.flatMap((owned) => owned.tags || []));
  const newOccasions = (candidate.tags || []).filter(
    (tag) => desiredOccasions.includes(tag) && !coveredOccasions.has(tag)
  );
  const score = clampScore((ownsRole ? 25 : 75) + newOccasions.length * 10);
  return {
    score,
    reasonCodes: [
      ...(ownsRole ? [] : [`missing-role:${role}`]),
      ...newOccasions.map((occasion) => `uncovered-occasion:${occasion.toLowerCase().replaceAll(' ', '-')}`),
    ],
  };
}

function versatilityScore(candidate, outfitCount) {
  const distinctUseCases = new Set(candidate.tags || []).size;
  return clampScore(35 + distinctUseCases * 10 + outfitCount * 7);
}

function recommendationFor({ compatibility, gap, redundancy, outfitUnlocks, candidate }) {
  const supportingEvidence = [];
  const opposingEvidence = [];
  if (compatibility.score >= 70) supportingEvidence.push('strong-wardrobe-compatibility');
  if (gap.score >= 65) supportingEvidence.push(...gap.reasonCodes);
  if (outfitUnlocks >= 2) supportingEvidence.push(`unlocks-${outfitUnlocks}-qualified-outfits`);
  if (candidate.offer?.priceStatus === 'confirmed') supportingEvidence.push('verified-price-evidence');
  else opposingEvidence.push('price-evidence-missing');
  if (redundancy.score >= 65) opposingEvidence.push('high-redundancy');
  if (!candidate.fact?.sourceUrl) opposingEvidence.push('canonical-source-unverified');
  if (!candidate.fact?.availabilityStatus) opposingEvidence.push('availability-unknown');

  let recommendation = 'wait';
  if (compatibility.parts.brand === 0 || redundancy.score >= 85) recommendation = 'skip';
  else if (compatibility.score < 50) recommendation = 'choose-alternative';
  else if (
    compatibility.score >= 68
    && gap.score >= 60
    && outfitUnlocks >= 2
    && candidate.fact?.availabilityStatus === 'available'
  ) recommendation = 'buy';

  const evidenceCount = supportingEvidence.length + opposingEvidence.length;
  const confidenceScore = clampScore(
    45
      + Math.min(evidenceCount, 5) * 7
      + (candidate.fact?.sourceVerifiedAt ? 10 : 0)
      + (candidate.offer?.priceStatus === 'confirmed' ? 8 : 0)
  );
  return {
    recommendation,
    reasonCodes: [...supportingEvidence, ...opposingEvidence],
    supportingEvidence,
    opposingEvidence,
    confidence: confidenceScore >= 80 ? 'high' : confidenceScore >= 60 ? 'medium' : 'low',
    confidenceScore,
  };
}

export function evaluatePurchase({
  profile,
  wardrobe,
  candidateId,
  catalog = canonicalProducts,
  offers = canonicalOffers,
  facts = productFacts,
}) {
  if (!profile?.id) {
    return {
      ok: false,
      error: 'incomplete-profile',
      recommendation: 'wait',
      confidence: 'low',
      reasonCodes: ['profile-id-required'],
    };
  }
  const candidate = productRecord(candidateId, catalog, offers, facts);
  if (!candidate) {
    return {
      ok: false,
      error: 'unknown-product',
      recommendation: 'wait',
      confidence: 'low',
      reasonCodes: ['canonical-product-not-found'],
    };
  }
  const wardrobeProducts = (wardrobe || [])
    .map((item) => productRecord(item.productId, catalog, offers, facts))
    .filter(Boolean);
  if (wardrobeProducts.length < 5) {
    return {
      ok: false,
      error: 'insufficient-wardrobe',
      recommendation: 'wait',
      confidence: 'low',
      reasonCodes: ['five-wardrobe-items-required'],
    };
  }

  const parts = {
    palette: paletteScore(candidate, profile),
    occasion: occasionScore(candidate, profile),
    brand: brandScore(candidate, profile),
    wardrobePairing: wardrobePairingScore(candidate, wardrobeProducts),
    fit: fitScore(candidate, profile),
  };
  const compatibility = { score: weightedScore(parts), parts };
  const { outfits, missingRoles } = buildOutfits(candidate, wardrobeProducts, profile);
  const redundancy = redundancyResult(candidate, wardrobeProducts);
  const gap = gapCoverage(candidate, wardrobeProducts, profile);
  const versatility = versatilityScore(candidate, outfits.length);
  const outcome = recommendationFor({
    compatibility,
    gap,
    redundancy,
    outfitUnlocks: outfits.length,
    candidate,
  });
  const purchaseRoi = clampScore(
    compatibility.score * 0.3
      + versatility * 0.2
      + gap.score * 0.2
      + Math.min(outfits.length * 20, 100) * 0.2
      + (100 - redundancy.score) * 0.1
  );

  return {
    ok: true,
    scoringVersion: SCORING_VERSION,
    fixtureUserId: profile.id,
    candidate: {
      productId: candidate.id,
      name: candidate.name,
      sourceUrl: candidate.fact?.sourceUrl ?? null,
      sourceVerifiedAt: candidate.fact?.sourceVerifiedAt ?? null,
      availabilityStatus: candidate.fact?.availabilityStatus ?? 'unknown',
      price: candidate.offer?.price ?? null,
      priceStatus: candidate.offer?.priceStatus ?? 'tbd',
    },
    wardrobeSnapshot: {
      itemCount: wardrobeProducts.length,
      productIds: wardrobeProducts.map((item) => item.id),
    },
    scores: {
      compatibility,
      versatility,
      gapCoverage: gap,
      redundancy,
      outfitUnlocks: outfits.length,
      purchaseRoi,
    },
    outfits,
    missingRoles,
    ...outcome,
  };
}
