// Real-Knowledge-Graph hero-candidacy assessment for the production writer
// (issue #46: "if no existing hero has enough verified facts, stop with
// one precise needs-human report instead of inventing data"). Pure,
// dependency-free — takes the live js/products.js/js/guides.js shape in,
// returns a structured report out, no I/O.
//
// A product is *hero-eligible* only if all three hold:
//   1. it carries a styling `profile` block (the signal this repo already
//      uses everywhere to mean "complete enough to anchor a guide" — see
//      docs/HERO_PRODUCT_V1.md's selection table);
//   2. it clears scripts/guide-manifest-schema.mjs's hero-cooldown check
//      against every currently published guide (never re-use a hero that
//      anchored a guide within the cooldown window);
//   3. the repository captures at least one verifiable source reference
//      for its commerce/styling facts (`sourceUrl` on the product record)
//      — required because scripts/guide-manifest-schema.mjs's
//      `sources[]` field can never be honestly populated without one, and
//      CLAUDE.md forbids inventing a citation to get past that check.
//
// This module never guesses or invents a `sourceUrl` — if a product
// doesn't already carry one, it is reported ineligible with that exact
// reason, not silently promoted.

import { buildExistingGuideContext } from './guide-factory.mjs';
import { checkHeroCooldown, DEFAULT_HERO_COOLDOWN_DAYS } from './guide-manifest-schema.mjs';

/**
 * Assesses every profile-bearing product in `products` as a candidate
 * hero for a brand-new guide, against `guides` (the live js/guides.js
 * shape) and `now`. Returns one entry per candidate plus a portfolio-level
 * `anyEligible` flag the caller can act on directly.
 */
export function assessHeroCandidates({ products, guides, now, heroCooldownDays = DEFAULT_HERO_COOLDOWN_DAYS }) {
  const existingGuideContext = buildExistingGuideContext(guides);
  const candidates = (products || [])
    .filter((p) => Boolean(p.profile))
    .map((product) => {
      const reasons = [];
      const cooldown = checkHeroCooldown({ heroProductId: product.id }, existingGuideContext, { now, cooldownDays: heroCooldownDays });
      if (cooldown.violated) {
        reasons.push(
          `hero cooldown: guide(s) ${cooldown.conflicts.map((c) => c.id).join(', ')} already used this product as hero within the ${heroCooldownDays}-day window`
        );
      }
      const hasVerifiableSource = typeof product.sourceUrl === 'string' && product.sourceUrl.trim().length > 0;
      if (!hasVerifiableSource) {
        reasons.push('no verifiable source URL captured in the repository for this product\'s facts — a manifest sources[] entry cannot be honestly authored without inventing one');
      }
      return {
        productId: product.id,
        name: product.name,
        heroCooldownBlocked: cooldown.violated,
        cooldownConflicts: cooldown.conflicts.map((c) => c.id),
        hasVerifiableSource,
        eligible: reasons.length === 0,
        reasons,
      };
    });

  return {
    candidates,
    eligibleCount: candidates.filter((c) => c.eligible).length,
    anyEligible: candidates.some((c) => c.eligible),
  };
}

/** One concise, actionable report string for the needs-human notification/status event. */
export function renderHeroCandidateReport(assessment) {
  if (assessment.anyEligible) {
    const eligible = assessment.candidates.filter((c) => c.eligible).map((c) => c.productId);
    return `${assessment.eligibleCount} hero candidate(s) eligible for a new pilot guide: ${eligible.join(', ')}.`;
  }
  const lines = [
    `No hero-eligible product can anchor a new pilot guide right now (${assessment.candidates.length} candidate(s) checked, 0 eligible).`,
    ...assessment.candidates.map((c) => `- "${c.productId}" (${c.name}): ${c.reasons.join('; ')}`),
    'Next action: a human editor must either (a) wait out the hero-cooldown window on an existing hero, or (b) add a real, verifiable sourceUrl for a candidate product\'s facts, then author and approve a guide job manifest under automation/guide-jobs/.',
  ];
  return lines.join('\n');
}
