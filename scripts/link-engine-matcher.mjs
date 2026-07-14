// Verified supporting-item link engine v1 (issue #24) — candidate matching
// and confidence scoring. Pure, dependency-free — takes an "intended item"
// (the editorial reference from an outfit) and a list of candidate
// listings (from scripts/link-engine-adapters.mjs) and returns a scored,
// classified result. Never picks a "plausible but unverified" candidate:
// anything short of a confident, well-separated top match is classified
// `ambiguous` or `no-match`, both of which scripts/link-engine.mjs routes
// to `needs-human` with the ranked evidence attached.
//
// Canonical spec: docs/LINK_ENGINE_V1.md

// Weights sum to 1.0. `canonicalId` dominates because an exact GTIN/MPN/SKU
// match is the strongest possible identity signal; `name` uses token
// overlap (not exact string equality) since retailer titles are rarely
// byte-identical to the editorial label.
export const MATCH_WEIGHTS = Object.freeze({
  canonicalId: 0.3,
  brand: 0.25,
  name: 0.25,
  category: 0.1,
  color: 0.06,
  material: 0.04,
});

export const EXACT_MATCH_THRESHOLD = 0.82;
export const AMBIGUOUS_MATCH_FLOOR = 0.55;
// If the runner-up's score is within this margin of the top candidate's,
// the match is not confidently disambiguated even if the top score alone
// would clear EXACT_MATCH_THRESHOLD.
export const AMBIGUITY_MARGIN = 0.06;
// A gender/audience mismatch is treated as a hard disqualifier, not a
// scored field — wrong-audience items must never be silently substituted.
const GENDER_MISMATCH_PENALTY_MULTIPLIER = 0;

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function tokens(value) {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function tokenOverlapRatio(a, b) {
  const tokensA = new Set(tokens(a));
  const tokensB = new Set(tokens(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap += 1;
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function fieldEquals(a, b) {
  if (!a || !b) return false;
  return normalize(a) === normalize(b);
}

/** Scores one candidate listing against one intended item. Returns the aggregate score plus every field's individual contribution, so a caller can explain the score, not just report it. */
export function scoreCandidate(intendedItem, listing) {
  const fieldScores = {};

  if (intendedItem.canonicalId && listing.canonicalId) {
    fieldScores.canonicalId = fieldEquals(intendedItem.canonicalId, listing.canonicalId) ? MATCH_WEIGHTS.canonicalId : 0;
  } else {
    fieldScores.canonicalId = 0;
  }

  fieldScores.brand = fieldEquals(intendedItem.brand, listing.brand) ? MATCH_WEIGHTS.brand : 0;
  fieldScores.name = tokenOverlapRatio(intendedItem.name || intendedItem.label, listing.name || listing.title) * MATCH_WEIGHTS.name;
  fieldScores.category = fieldEquals(intendedItem.category, listing.category) ? MATCH_WEIGHTS.category : 0;
  fieldScores.color = intendedItem.color && listing.color ? (fieldEquals(intendedItem.color, listing.color) ? MATCH_WEIGHTS.color : 0) : 0;
  fieldScores.material =
    intendedItem.material && listing.material ? (fieldEquals(intendedItem.material, listing.material) ? MATCH_WEIGHTS.material : 0) : 0;

  let score = Object.values(fieldScores).reduce((sum, v) => sum + v, 0);

  const genderMismatch =
    intendedItem.gender && listing.gender && intendedItem.gender !== 'unisex' && listing.gender !== 'unisex'
      ? normalize(intendedItem.gender) !== normalize(listing.gender)
      : false;
  if (genderMismatch) score *= GENDER_MISMATCH_PENALTY_MULTIPLIER;

  // An exact canonical-identifier match is definitive on its own — real
  // catalog data can have a strong canonical id match alongside a noisy
  // title, and that should not be dragged down by a weak name-token score.
  if (fieldScores.canonicalId === MATCH_WEIGHTS.canonicalId) {
    score = Math.max(score, 1);
  }

  return { score: Math.min(1, score), fieldScores, genderMismatch };
}

/**
 * Ranks every candidate, classifies the outcome, and never silently picks
 * a weak or ambiguous match:
 *   - `exact`: top score clears EXACT_MATCH_THRESHOLD *and* is separated
 *     from the runner-up by at least AMBIGUITY_MARGIN.
 *   - `ambiguous`: a candidate cleared AMBIGUOUS_MATCH_FLOOR but the top
 *     result isn't confidently disambiguated (either below the exact
 *     threshold, or too close to a runner-up).
 *   - `no-match`: nothing cleared AMBIGUOUS_MATCH_FLOOR.
 */
export function matchCandidates(intendedItem, candidates) {
  const ranked = (candidates || [])
    .map((listing) => {
      const { score, fieldScores, genderMismatch } = scoreCandidate(intendedItem, listing);
      return { listing, score, fieldScores, genderMismatch };
    })
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { outcome: 'no-match', best: null, ranked: [], reasons: ['no candidate listings were returned by any configured adapter'] };
  }

  const top = ranked[0];
  const runnerUp = ranked[1];

  if (top.score < AMBIGUOUS_MATCH_FLOOR) {
    return {
      outcome: 'no-match',
      best: null,
      ranked,
      reasons: [`best candidate score ${top.score.toFixed(2)} is below the ambiguous-match floor ${AMBIGUOUS_MATCH_FLOOR}`],
    };
  }

  const separated = !runnerUp || top.score - runnerUp.score >= AMBIGUITY_MARGIN;
  if (top.score >= EXACT_MATCH_THRESHOLD && separated) {
    return { outcome: 'exact', best: top, ranked, reasons: [] };
  }

  const reasons = [];
  if (top.score < EXACT_MATCH_THRESHOLD) {
    reasons.push(`best candidate score ${top.score.toFixed(2)} is below the exact-match threshold ${EXACT_MATCH_THRESHOLD}`);
  }
  if (!separated) {
    reasons.push(
      `top two candidates are within ${AMBIGUITY_MARGIN} of each other (${top.score.toFixed(2)} vs ${runnerUp.score.toFixed(2)}) — not confidently disambiguated`
    );
  }
  return { outcome: 'ambiguous', best: null, ranked, reasons };
}
