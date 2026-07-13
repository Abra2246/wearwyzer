// Pure, dependency-free schema + validation for the autonomous guide
// factory's "guide job manifest" contract (issue #17, section 1). No I/O
// in this file — every function takes plain data in and returns plain
// data out, exactly like scripts/queue-rules.mjs, so it can be unit
// tested with fixtures (scripts/__tests__/) without touching the real
// site data or the network.
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md
//
// A manifest is the single source of truth a guide factory job runs
// from. It must be fully self-describing: every product/affiliate fact
// it relies on is either a reference to an already-verified Knowledge
// Graph record (data/products.js) or an explicitly authored `newProducts`
// entry that obeys this repo's content-integrity rules (CLAUDE.md —
// price/affiliateUrl stay null/"" until confirmed, never fabricated).
// This module never invents a missing fact; it only ever reports that
// one is missing, stale, or unresolved so the caller can route the job
// to `needs-human` instead of guessing.

export const GUIDE_JOB_STATUSES = Object.freeze([
  'draft', // being authored, not yet eligible for the factory to pick up
  'approved', // eligible for the factory to select next
  'in-progress', // claimed by a single factory run
  'ready-for-pr', // pipeline succeeded; a PR should be opened
  'needs-human', // pipeline stopped because a fact/asset/validator could not be resolved
  'published', // PR merged and live
  'rejected', // an editor explicitly declined this job
]);

// Guide creation is always at least "medium" risk (a new customer-facing
// page — see docs/AUTONOMOUS_ENGINEERING_V1.md's risk model) — a guide
// manifest may never declare itself "low".
export const GUIDE_JOB_RISK_TIERS = Object.freeze(['medium', 'high']);

export const CONFIDENCE_LEVELS = Object.freeze(['unverified', 'inferred', 'editorial', 'verified']);

export const DEFAULT_MAX_SOURCE_AGE_DAYS = 120;
export const DEFAULT_HERO_COOLDOWN_DAYS = 60;
export const DEFAULT_CONCEPT_COOLDOWN_DAYS = 60;
// Below this token-overlap ratio, two concepts are considered distinct.
export const CONCEPT_SIMILARITY_THRESHOLD = 0.6;

export const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  'jobId',
  'schemaVersion',
  'status',
  'riskTier',
  'confidence',
  'heroProductId',
  'concept',
  'hook',
  'audience',
  'sources',
  'outfits',
  'slides',
  'website',
  'social',
  'assets',
  'publication',
  'createdAt',
]);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

/** Structural shape check: every required top-level field is present and non-empty where a string. */
export function validateManifestShape(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest is not an object'] };
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest) || manifest[field] === null || manifest[field] === undefined) {
      errors.push(`missing required field "${field}"`);
    }
  }
  if (errors.length) return { valid: false, errors };

  if (!GUIDE_JOB_STATUSES.includes(manifest.status)) {
    errors.push(`status "${manifest.status}" is not one of ${GUIDE_JOB_STATUSES.join(', ')}`);
  }
  if (!GUIDE_JOB_RISK_TIERS.includes(manifest.riskTier)) {
    errors.push(`riskTier "${manifest.riskTier}" must be one of ${GUIDE_JOB_RISK_TIERS.join(', ')} (a new guide is never risk-low)`);
  }
  if (!CONFIDENCE_LEVELS.includes(manifest.confidence)) {
    errors.push(`confidence "${manifest.confidence}" is not one of ${CONFIDENCE_LEVELS.join(', ')}`);
  }
  if (!isNonEmptyString(manifest.heroProductId)) errors.push('heroProductId must be a non-empty string');
  if (!isNonEmptyString(manifest.concept)) errors.push('concept must be a non-empty string');
  if (!isNonEmptyString(manifest.hook)) errors.push('hook must be a non-empty string');
  if (!manifest.audience || !isNonEmptyString(manifest.audience.gender)) {
    errors.push('audience.gender must be a non-empty string');
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    errors.push('sources must be a non-empty array');
  }
  if (!Array.isArray(manifest.outfits) || manifest.outfits.length === 0) {
    errors.push('outfits must be a non-empty array');
  }
  if (!Array.isArray(manifest.slides) || manifest.slides.length === 0) {
    errors.push('slides must be a non-empty array');
  }
  if (!manifest.website || !isNonEmptyString(manifest.website.title) || !isNonEmptyString(manifest.website.slugHint)) {
    errors.push('website.title and website.slugHint must be non-empty strings');
  }
  if (!manifest.social || !isNonEmptyString(manifest.social.caption) || !isNonEmptyString(manifest.social.altText)) {
    errors.push('social.caption and social.altText must be non-empty strings');
  }
  if (!manifest.publication || !isNonEmptyString(manifest.publication.status)) {
    errors.push('publication.status must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Every source must carry a verification timestamp no older than
 * `maxAgeDays`. A source missing `verifiedAt` entirely is treated as
 * unresolved, not stale, since there is no fact to judge freshness on.
 */
export function findStaleOrUnverifiedSources(manifest, { now, maxAgeDays = DEFAULT_MAX_SOURCE_AGE_DAYS } = {}) {
  const nowIso = now || new Date().toISOString();
  const problems = [];
  for (const source of manifest.sources || []) {
    if (!isNonEmptyString(source.url)) {
      problems.push({ source, reason: 'missing url' });
      continue;
    }
    if (!isNonEmptyString(source.verifiedAt)) {
      problems.push({ source, reason: 'missing verifiedAt timestamp' });
      continue;
    }
    const age = daysBetween(source.verifiedAt, nowIso);
    if (age > maxAgeDays) {
      problems.push({ source, reason: `verifiedAt is ${Math.round(age)} day(s) old (max ${maxAgeDays})` });
    }
  }
  return problems;
}

/**
 * Every productId referenced by an outfit item, or listed in
 * `productReferences`, must resolve to either an existing product
 * (`existingProductIds`) or a manifest-declared `newProducts` entry.
 * Never silently drops or invents a reference — matches
 * scripts/validate-content-data.mjs's outfit-item resolution rule.
 */
export function findUnresolvedProductReferences(manifest, { existingProductIds = new Set() } = {}) {
  const declaredNewIds = new Set((manifest.newProducts || []).map((p) => p.id));
  const unresolved = [];

  const checkId = (productId, context) => {
    if (!productId) return; // items may carry only an editorialLabel — that's valid, not unresolved
    if (!existingProductIds.has(productId) && !declaredNewIds.has(productId)) {
      unresolved.push({ productId, context });
    }
  };

  checkId(manifest.heroProductId, 'heroProductId');
  for (const pid of manifest.productReferences || []) checkId(pid, 'productReferences');
  for (const outfit of manifest.outfits || []) {
    for (const item of outfit.items || []) {
      if (item.productId && !item.editorialLabel) checkId(item.productId, `outfit "${outfit.name}" item "${item.name}"`);
    }
  }
  return unresolved;
}

/**
 * Enforces CLAUDE.md's content-integrity rule on any product the
 * manifest declares fresh (`newProducts`): price stays null unless
 * priceStatus is "confirmed" and a source backs it up; affiliateUrl
 * stays "" unless it is a real, sourced link.
 */
export function findFabricationViolations(manifest) {
  const violations = [];
  for (const product of manifest.newProducts || []) {
    if (product.priceStatus === 'confirmed') {
      if (product.price === null || product.price === undefined) {
        violations.push(`newProducts "${product.id}": priceStatus "confirmed" but price is null/undefined`);
      }
      if (!isNonEmptyString(product.priceSourceUrl)) {
        violations.push(`newProducts "${product.id}": confirmed price has no priceSourceUrl to verify it against`);
      }
    } else if (product.priceStatus === 'tbd' || !product.priceStatus) {
      if (product.price !== null && product.price !== undefined) {
        violations.push(`newProducts "${product.id}": priceStatus is "tbd" but price is set to ${product.price} — fabricated fact`);
      }
    } else {
      violations.push(`newProducts "${product.id}": priceStatus "${product.priceStatus}" is not "tbd" or "confirmed"`);
    }

    if (isNonEmptyString(product.affiliateUrl) && !isNonEmptyString(product.affiliateSourceUrl)) {
      violations.push(`newProducts "${product.id}": affiliateUrl is set without an affiliateSourceUrl to verify it against`);
    }
  }
  return violations;
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function jaccardOverlap(a, b) {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * No duplicate hero product within the cooldown window. `existingGuides`
 * is the plain array shape from js/guides.js (or an equivalent fixture),
 * each carrying `heroProductId`-equivalent identity via its own hero
 * product field and `publishedDate`.
 */
export function checkHeroCooldown(manifest, existingGuides, {
  now,
  cooldownDays = DEFAULT_HERO_COOLDOWN_DAYS,
} = {}) {
  const nowIso = now || new Date().toISOString();
  const conflicts = (existingGuides || []).filter((g) => {
    if (g.heroProductId !== manifest.heroProductId) return false;
    if (!g.publishedDate) return false;
    return daysBetween(g.publishedDate, nowIso) <= cooldownDays;
  });
  return { violated: conflicts.length > 0, conflicts };
}

/** No substantially duplicate concept within the cooldown window (token-overlap heuristic). */
export function checkConceptDuplication(manifest, existingGuides, {
  now,
  cooldownDays = DEFAULT_CONCEPT_COOLDOWN_DAYS,
  threshold = CONCEPT_SIMILARITY_THRESHOLD,
} = {}) {
  const nowIso = now || new Date().toISOString();
  const conflicts = [];
  for (const g of existingGuides || []) {
    if (!g.publishedDate || daysBetween(g.publishedDate, nowIso) > cooldownDays) continue;
    const similarity = Math.max(
      jaccardOverlap(manifest.concept, g.concept || g.verdict || g.description || ''),
      jaccardOverlap(manifest.hook, g.hook || g.description || '')
    );
    if (similarity >= threshold) conflicts.push({ guideId: g.id, similarity });
  }
  return { violated: conflicts.length > 0, conflicts };
}

/**
 * Full manifest validation, aggregating every check above. Returns a
 * single result with `valid` (safe to proceed) and every category of
 * problem populated so the caller can build a specific, actionable
 * `needs-human` reason instead of a generic failure.
 */
export function validateGuideManifest(manifest, {
  existingProductIds = new Set(),
  existingGuides = [],
  now,
  maxSourceAgeDays = DEFAULT_MAX_SOURCE_AGE_DAYS,
  heroCooldownDays = DEFAULT_HERO_COOLDOWN_DAYS,
  conceptCooldownDays = DEFAULT_CONCEPT_COOLDOWN_DAYS,
} = {}) {
  const shape = validateManifestShape(manifest);
  if (!shape.valid) {
    return {
      valid: false,
      shapeErrors: shape.errors,
      staleSources: [],
      unresolvedProducts: [],
      fabricationViolations: [],
      heroCooldown: { violated: false, conflicts: [] },
      conceptDuplication: { violated: false, conflicts: [] },
      reasons: shape.errors,
    };
  }

  const staleSources = findStaleOrUnverifiedSources(manifest, { now, maxAgeDays: maxSourceAgeDays });
  const unresolvedProducts = findUnresolvedProductReferences(manifest, { existingProductIds });
  const fabricationViolations = findFabricationViolations(manifest);
  const heroCooldown = checkHeroCooldown(manifest, existingGuides, { now, cooldownDays: heroCooldownDays });
  const conceptDuplication = checkConceptDuplication(manifest, existingGuides, { now, cooldownDays: conceptCooldownDays });

  const reasons = [];
  if (staleSources.length) {
    reasons.push(`${staleSources.length} stale/unverified source(s): ${staleSources.map((s) => s.reason).join('; ')}`);
  }
  if (unresolvedProducts.length) {
    reasons.push(
      `${unresolvedProducts.length} unresolved product reference(s): ${unresolvedProducts
        .map((u) => `${u.productId} (${u.context})`)
        .join('; ')}`
    );
  }
  if (fabricationViolations.length) reasons.push(...fabricationViolations);
  if (heroCooldown.violated) {
    reasons.push(
      `hero product "${manifest.heroProductId}" duplicates guide(s) ${heroCooldown.conflicts
        .map((c) => c.id)
        .join(', ')} within the ${heroCooldownDays}-day cooldown window`
    );
  }
  if (conceptDuplication.violated) {
    reasons.push(
      `concept is substantially similar to guide(s) ${conceptDuplication.conflicts
        .map((c) => `${c.guideId} (${Math.round(c.similarity * 100)}% overlap)`)
        .join(', ')} within the ${conceptCooldownDays}-day cooldown window`
    );
  }

  return {
    valid: reasons.length === 0,
    shapeErrors: [],
    staleSources,
    unresolvedProducts,
    fabricationViolations,
    heroCooldown,
    conceptDuplication,
    reasons: reasons.length ? reasons : ['eligible'],
  };
}
