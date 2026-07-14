// Verified supporting-item link engine v1 (issue #24) — offer
// verification. Pure, dependency-free — turns one adapter listing
// snapshot (scripts/link-engine-adapters.mjs `verify()` result) into a
// structured, timestamped verified-offer record. Price and availability
// are always timestamped observations (`verifiedAtIso`), never permanent
// claims (CLAUDE.md's fabrication rule, this issue's "no fabricated
// products, prices, commissions, availability, affiliate eligibility, or
// URLs" rule).
//
// Canonical spec: docs/LINK_ENGINE_V1.md
//
// `canonicalUrl`, `retailerUrl`, and `affiliateUrl` are always carried as
// three distinct fields, never merged or one overwriting another — a
// listing can have a real retailer page with no affiliate program yet,
// and this module must not paper over that distinction.

import { scoreCandidate } from './link-engine-matcher.mjs';

export const LINK_STATUSES = Object.freeze(['live', 'dead', 'redirected', 'out-of-stock', 'mismatched', 'unavailable']);

export const DEFAULT_MAX_STALE_DAYS = 14;
// A verified listing's title/brand must still resemble the intended item
// beyond this bar, or it's treated as identity drift (the retailer
// swapped what's behind the URL) rather than a still-valid match.
const MISMATCH_SCORE_FLOOR = 0.4;

const REDIRECT_HTTP_STATUSES = new Set([301, 302, 303, 307, 308]);

function isDeadHttpStatus(httpStatus) {
  return httpStatus == null || httpStatus >= 400;
}

/**
 * Verifies one listing snapshot against the intended item it was matched
 * to. `listingSnapshot` is exactly what an adapter's `verify(listingId)`
 * returned — `null` means the listing could no longer be found at all
 * (delisted/removed), which is verified as `unavailable`, distinct from a
 * live-but-erroring URL (`dead`).
 */
export function verifyOffer({ intendedItem, listingSnapshot, now, allowLooseIdentity = false }) {
  const verifiedAtIso = now || new Date().toISOString();

  if (!listingSnapshot) {
    return {
      listingId: null,
      adapterId: null,
      intendedOutfitItemId: intendedItem.outfitItemId,
      linkStatus: 'unavailable',
      canonicalUrl: null,
      retailerUrl: null,
      affiliateUrl: null,
      httpStatus: null,
      redirectTo: null,
      retailerName: null,
      title: null,
      brand: null,
      price: null,
      currency: null,
      stock: 'unknown',
      affiliateEligible: false,
      matchScore: null,
      verifiedAtIso,
      reasons: ['listing was not found by the adapter — likely delisted or removed'],
    };
  }

  const reasons = [];
  const { score: matchScore } = scoreCandidate(intendedItem, listingSnapshot);

  const base = {
    listingId: listingSnapshot.listingId,
    adapterId: listingSnapshot.adapterId,
    intendedOutfitItemId: intendedItem.outfitItemId,
    canonicalUrl: listingSnapshot.canonicalUrl ?? null,
    retailerUrl: listingSnapshot.retailerUrl ?? null,
    affiliateUrl: listingSnapshot.affiliateUrl ?? null,
    httpStatus: listingSnapshot.httpStatus ?? null,
    redirectTo: listingSnapshot.redirectTo ?? null,
    retailerName: listingSnapshot.retailerName ?? null,
    title: listingSnapshot.title ?? listingSnapshot.name ?? null,
    brand: listingSnapshot.brand ?? null,
    price: listingSnapshot.price ?? null,
    currency: listingSnapshot.currency ?? null,
    stock: listingSnapshot.stock ?? 'unknown',
    affiliateEligible: Boolean(listingSnapshot.affiliateEligible && listingSnapshot.affiliateUrl),
    matchScore,
    verifiedAtIso,
  };

  if (isDeadHttpStatus(listingSnapshot.httpStatus)) {
    reasons.push(`destination returned HTTP ${listingSnapshot.httpStatus ?? '(none)'}`);
    return { ...base, linkStatus: 'dead', reasons };
  }

  if (REDIRECT_HTTP_STATUSES.has(listingSnapshot.httpStatus)) {
    reasons.push(
      `destination redirected (HTTP ${listingSnapshot.httpStatus}) to ${listingSnapshot.redirectTo || '(unknown target)'} — flagged for human confirmation rather than silently followed`
    );
    return { ...base, linkStatus: 'redirected', reasons };
  }

  // Identity-drift detection only applies when this listing is supposed to
  // BE the intended item (an exact match, or a re-check of a previously
  // exact-matched record). scripts/link-engine.mjs sets
  // `allowLooseIdentity: true` when verifying a deliberately-approved
  // alternative (same category/gender/price tier, different product by
  // design) — a low identity score there is expected, not drift.
  if (!allowLooseIdentity && matchScore < MISMATCH_SCORE_FLOOR) {
    reasons.push(
      `verified listing title/brand ("${base.title}"/"${base.brand}") no longer matches the intended item (identity score ${matchScore.toFixed(2)}) — likely product identity drift`
    );
    return { ...base, linkStatus: 'mismatched', reasons };
  }

  if (base.stock === 'out_of_stock') {
    reasons.push('destination reports out of stock');
    return { ...base, linkStatus: 'out-of-stock', reasons };
  }

  if (!base.affiliateEligible) {
    reasons.push('listing is live but not currently affiliate-eligible (no active affiliate program/link)');
  }

  return { ...base, linkStatus: 'live', reasons };
}

/** Coverage eligibility (issue's 80–90% target): the offer must be live, affiliate-eligible, and actually carry an affiliate URL — never counted from a dead/mismatched/non-affiliate offer. */
export function isCoverageEligibleOffer(offer) {
  return Boolean(offer) && offer.linkStatus === 'live' && offer.affiliateEligible === true && Boolean(offer.affiliateUrl);
}

/** Whether a stored verified-offer record is old enough to need rechecking. A record with no verifiedAtIso is always stale (never verified). */
export function isStale(offerRecord, { now, maxStaleDays = DEFAULT_MAX_STALE_DAYS } = {}) {
  if (!offerRecord || !offerRecord.verifiedAtIso) return true;
  const nowMs = new Date(now).getTime();
  const verifiedMs = new Date(offerRecord.verifiedAtIso).getTime();
  if (Number.isNaN(nowMs) || Number.isNaN(verifiedMs)) return true;
  const ageDays = (nowMs - verifiedMs) / 86400000;
  return ageDays > maxStaleDays;
}
