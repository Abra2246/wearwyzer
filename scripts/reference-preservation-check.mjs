// Reference preservation / visual QA rule set (issue #18, section 4).
// Pure, conservative, rule-based. This repo has no image-processing
// dependency to run real pixel-level computer vision (CLAUDE.md: no
// package manager, dependency-free scripts) — so the checks below split
// into two kinds:
//
//   1. Structural rules this module CAN check for certain today (was a
//      reference image actually supplied for the hero product; did the
//      caller accidentally ask the image model to typeset final text).
//   2. Pixel-level categories (wrong colorway, changed silhouette,
//      missing/malformed hero item, duplicated limbs, unreadable
//      embedded text, cross-slide hero consistency) that genuinely
//      require a vision pass this environment does not have. For these,
//      the conservative and honest behavior is to mark the result
//      `needs-human` by default — never guess an accept — unless the
//      caller supplies concrete `visionSignals` from an actual review
//      pass (human or a future automated vision-model integration).
//
// This matches issue #18 section 4's explicit requirement: "Uncertain
// outputs must be marked needs-human or retried; never silently
// accepted."
//
// Canonical spec: docs/OPENAI_IMAGE_RENDERER_V1.md

export const REJECTION_REASONS = Object.freeze([
  'wrong-colorway',
  'changed-silhouette',
  'missing-or-malformed-hero-item',
  'duplicated-limbs-or-garment-artifact',
  'unreadable-or-generated-embedded-text',
]);

/**
 * Evaluates one generated slide against the manifest's declared hero
 * facts. Returns `verdict`: 'accept' | 'needs-human' | 'reject'.
 *   - 'reject': a structural rule this module can check for certain was
 *     violated, or the provider itself refused/failed.
 *   - 'needs-human': generation succeeded and no structural rule was
 *     violated, but no vision signal exists to certify the pixel-level
 *     categories — the conservative default.
 *   - 'accept': generation succeeded, no structural violation, and the
 *     supplied `visionSignals` explicitly cleared every pixel-level
 *     category.
 */
export function evaluateSlidePreservation({
  generationResult,
  heroProduct = null,
  referenceImageSupplied = false,
  visionSignals = null,
} = {}) {
  if (!generationResult || generationResult.status !== 'generated') {
    return {
      verdict: 'reject',
      reasons: [generationResult?.reason || 'no successful generation to evaluate'],
    };
  }

  const structuralViolations = [];
  if (heroProduct && heroProduct.involvesHero !== false && !referenceImageSupplied) {
    structuralViolations.push('no-reference-image-supplied');
  }
  if (generationResult.requestedLegibleFinalText) {
    // The hybrid architecture never asks the image model to typeset final
    // copy (issue #18 section 3) — if this ever fires it's a caller bug,
    // not something a vision pass could approve past.
    structuralViolations.push('unreadable-or-generated-embedded-text');
  }
  if (structuralViolations.length > 0) {
    return { verdict: 'reject', reasons: structuralViolations };
  }

  if (!visionSignals) {
    return {
      verdict: 'needs-human',
      reasons: [
        'no automated visual verification signal available — pixel-level checks (colorway, ' +
          'silhouette, hero item presence, garment artifacts, embedded text) require a vision ' +
          'review pass not implemented in this dependency-free repo; route for human review before acceptance',
      ],
    };
  }

  const reasons = [];
  if (visionSignals.wrongColorway) reasons.push('wrong-colorway');
  if (visionSignals.changedSilhouette) reasons.push('changed-silhouette');
  if (visionSignals.heroItemMissing) reasons.push('missing-or-malformed-hero-item');
  if (visionSignals.garmentArtifact) reasons.push('duplicated-limbs-or-garment-artifact');
  if (visionSignals.embeddedText) reasons.push('unreadable-or-generated-embedded-text');

  if (reasons.length > 0) return { verdict: 'reject', reasons };
  return { verdict: 'accept', reasons: ['vision signals cleared every pixel-level category'] };
}

/**
 * Every accepted slide for one guide must agree on the same declared hero
 * product — never let it silently drift slide to slide. `slideResults` is
 * `[{ accepted, heroProductId }, ...]`, one entry per rendered slide.
 */
export function evaluateHeroConsistencyAcrossSlides(slideResults) {
  const heroIds = new Set(
    (slideResults || [])
      .filter((s) => s.accepted)
      .map((s) => s.heroProductId)
      .filter(Boolean)
  );
  if (heroIds.size > 1) {
    return {
      verdict: 'needs-human',
      reasons: [`inconsistent-hero-across-slides: ${[...heroIds].join(', ')}`],
    };
  }
  return { verdict: 'accept', reasons: ['consistent hero product across every accepted slide'] };
}
