// Machine-enforced content quality policy for autonomously generated
// guides (issue #17, section 5). Pure, dependency-free — every function
// takes plain data in and returns plain data out, same style as
// scripts/queue-rules.mjs and scripts/guide-manifest-schema.mjs.
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md
//
// Hero/concept duplication and fabrication checks already live in
// scripts/guide-manifest-schema.mjs (they need the manifest itself, not
// the built guide record) — this module covers the remaining structural
// and editorial checks that run against the *built* guide record and
// slide specs, plus the affiliate-coverage report.

export const MIN_OUTFITS = 3;
export const MIN_SLIDES = 4;
export const MAX_SLIDES = 10;
// Mobile-safe portrait carousel ratio already used by every published
// guide (see guide-on-cloud-x4.dc.html / guide-nb9060.dc.html slide
// images, all authored at 1254x1254 or equivalent square/portrait crops
// rendered at width:100%,height:auto in a horizontally-scrollable strip).
export const ALLOWED_ASPECT_RATIOS = Object.freeze([
  { name: '1:1', ratio: 1 },
  { name: '4:5', ratio: 4 / 5 },
]);
const ASPECT_RATIO_TOLERANCE = 0.02;

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/** Every guide needs a real audience/gender focus — never left blank or guessed. */
export function checkAudienceConsistency(manifest) {
  const violations = [];
  const gender = manifest.audience && manifest.audience.gender;
  if (!gender || !['men', 'women', 'unisex'].includes(String(gender).toLowerCase())) {
    violations.push(`audience.gender "${gender}" must be one of "men", "women", "unisex"`);
  }
  return violations;
}

/** Every guide follows the same editorial shape: name, when, why, and a non-empty item list per outfit. */
export function checkEditorialStructure(guideRecord) {
  const violations = [];
  const outfits = guideRecord.outfits || [];
  if (outfits.length < MIN_OUTFITS) {
    violations.push(`only ${outfits.length} outfit(s) — minimum is ${MIN_OUTFITS}`);
  }
  outfits.forEach((o, i) => {
    if (!o.name) violations.push(`outfit ${i + 1}: missing name`);
    if (!o.when) violations.push(`outfit "${o.name || i + 1}": missing "when" context`);
    if (!o.why) violations.push(`outfit "${o.name || i + 1}": missing "why" rationale`);
    if (!Array.isArray(o.items) || o.items.length === 0) {
      violations.push(`outfit "${o.name || i + 1}": has no items`);
    }
  });
  return violations;
}

/** No two outfits should be the same "when" context or an identical item set — required outfit diversity. */
export function checkOutfitDiversity(guideRecord) {
  const violations = [];
  const outfits = guideRecord.outfits || [];
  const seenSignatures = new Map();
  const seenWhen = new Map();
  outfits.forEach((o) => {
    const signature = (o.items || [])
      .map((it) => it.productId || it.editorialLabel || it.name)
      .sort()
      .join('|');
    if (seenSignatures.has(signature)) {
      violations.push(`outfit "${o.name}" has an identical item set to outfit "${seenSignatures.get(signature)}"`);
    } else {
      seenSignatures.set(signature, o.name);
    }

    const whenKey = String(o.when || '').trim().toLowerCase();
    if (whenKey) {
      if (seenWhen.has(whenKey)) {
        violations.push(`outfit "${o.name}" repeats the same "when" context as outfit "${seenWhen.get(whenKey)}"`);
      } else {
        seenWhen.set(whenKey, o.name);
      }
    }
  });
  return violations;
}

/** Slide count and aspect ratio must stay within the mobile-safe carousel bounds every published guide already uses. */
export function checkCarouselDimensions(slideSpecs) {
  const violations = [];
  const count = (slideSpecs || []).length;
  if (count < MIN_SLIDES || count > MAX_SLIDES) {
    violations.push(`${count} slide(s) — must be between ${MIN_SLIDES} and ${MAX_SLIDES}`);
  }
  for (const spec of slideSpecs || []) {
    if (!spec.width || !spec.height) {
      violations.push(`slide ${spec.order}: missing width/height`);
      continue;
    }
    const ratio = spec.width / spec.height;
    const matches = ALLOWED_ASPECT_RATIOS.some((a) => Math.abs(a.ratio - ratio) <= ASPECT_RATIO_TOLERANCE);
    if (!matches) {
      violations.push(
        `slide ${spec.order}: ${spec.width}x${spec.height} is not a mobile-safe aspect ratio (allowed: ${ALLOWED_ASPECT_RATIOS.map((a) => a.name).join(', ')})`
      );
    }
  }
  return violations;
}

/**
 * Every slide needs a non-empty alt text (public recommendation /
 * accessibility eligibility) and a deterministic, collision-free asset
 * naming pattern (`slide-NN`) matching the convention every existing
 * guide's `slideImages` already uses (see js/guides.js).
 */
export function checkAssetNamingAndExistence(guideRecord, renderedAssets) {
  const violations = [];
  const byOrder = new Map((renderedAssets || []).map((a) => [a.slideOrder, a]));
  (guideRecord.slideImages || []).forEach((slide, i) => {
    const order = i + 1;
    if (!slide.label) violations.push(`slide ${order}: missing label`);
    const expectedPattern = new RegExp(`slide-${String(order).padStart(2, '0')}\\.(png|svg|jpg|jpeg)$`);
    if (!expectedPattern.test(slide.src || '')) {
      violations.push(`slide ${order}: asset path "${slide.src}" does not match the "slide-${String(order).padStart(2, '0')}.<ext>" naming convention`);
    }
    const rendered = byOrder.get(order);
    if (!rendered || rendered.status !== 'rendered') {
      violations.push(`slide ${order}: no rendered asset available (status: ${rendered ? rendered.status : 'missing'})`);
    }
  });
  return violations;
}

/**
 * Informational only, never blocking (issue #17: "affiliate coverage
 * reporting without compromising styling quality") — reports what
 * fraction of the guide's shoppable products have a real, non-fabricated
 * affiliate link versus "Link coming soon".
 */
export function reportAffiliateCoverage(productRecords) {
  const total = (productRecords || []).length;
  const withLink = (productRecords || []).filter((p) => p.affiliateUrl).length;
  return {
    total,
    withAffiliateLink: withLink,
    coverageRatio: total === 0 ? 0 : withLink / total,
  };
}

/**
 * A relationship/edge is eligible for any public-facing recommendation
 * surface only under the same rule data/taxonomies.js's
 * isPubliclyRecommendable() already enforces for the live Knowledge
 * Graph: verificationStatus must be "verified" and confidence must be
 * "editorial" or "verified". Reimplemented here (rather than imported)
 * because this module must stay a pure, standalone policy check that
 * can run against a guide record before it is ever written to data/.
 */
export function isEligibleForPublicRecommendation(edge) {
  if (!edge) return false;
  if (edge.verificationStatus !== 'verified') return false;
  return edge.confidence === 'editorial' || edge.confidence === 'verified';
}

/**
 * Runs every policy check and aggregates the result. `blockingViolations`
 * must be empty for the pipeline to proceed to `ready-for-pr`;
 * `affiliateCoverage` is reporting-only and never blocks.
 */
export function runContentQualityPolicy({ manifest, guideRecord, productRecords, slideSpecs, renderedAssets }) {
  const blockingViolations = [
    ...checkAudienceConsistency(manifest),
    ...checkEditorialStructure(guideRecord),
    ...checkOutfitDiversity(guideRecord),
    ...checkCarouselDimensions(slideSpecs),
    ...checkAssetNamingAndExistence(guideRecord, renderedAssets),
  ];

  return {
    passed: blockingViolations.length === 0,
    blockingViolations,
    affiliateCoverage: reportAffiliateCoverage(productRecords),
  };
}
