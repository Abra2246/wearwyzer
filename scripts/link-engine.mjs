// Verified supporting-item link engine v1 (issue #24) — pure pipeline
// orchestration. Ties together scripts/link-engine-adapters.mjs (search /
// verify), scripts/link-engine-matcher.mjs (candidate scoring), and
// scripts/link-engine-verifier.mjs (offer verification) into one
// resolution per supporting item, plus scheduled revalidation of already
// -verified offers. No I/O in this file — scripts/link-engine-cli.mjs is
// the only place that would read real Knowledge Graph data or write a
// report, exactly the pure-logic/thin-IO split every other automation
// script in this repo already follows (scripts/guide-factory.mjs,
// scripts/style-guide-importer.mjs).
//
// Canonical spec: docs/LINK_ENGINE_V1.md
//
// Hard rule this module enforces end to end: an item either resolves to a
// verified offer (exact or clearly-labeled alternative) or becomes
// `needs-human` with concrete evidence. There is no third path where a
// weak or unverified candidate is attached anyway.

import { matchCandidates, scoreCandidate } from './link-engine-matcher.mjs';
import { verifyOffer, isCoverageEligibleOffer } from './link-engine-verifier.mjs';

export const RESOLUTION_OUTCOMES = Object.freeze(['verified', 'needs-human']);
export const OFFER_TYPES = Object.freeze(['exact', 'alternative']);

function isUsableForSearch(adapter) {
  return adapter && typeof adapter.search === 'function' && typeof adapter.verify === 'function';
}

async function collectCandidates(adapters, query) {
  const usable = (adapters || []).filter(isUsableForSearch);
  const lists = await Promise.all(
    usable.map(async (adapter) => {
      const result = await adapter.search(query);
      if (!Array.isArray(result)) return []; // an inert http-provider adapter's `{ blocked: true, ... }` contributes no candidates
      return result.map((listing) => ({ ...listing, adapterId: listing.adapterId || adapter.id }));
    })
  );
  return lists.flat();
}

function findAdapterById(adapters, adapterId) {
  return (adapters || []).find((a) => a.id === adapterId) || null;
}

async function verifyCandidate(intendedItem, candidate, adapters, { now, allowLooseIdentity = false }) {
  const adapter = findAdapterById(adapters, candidate.listing.adapterId);
  const snapshot = adapter ? await adapter.verify(candidate.listing.listingId) : null;
  return verifyOffer({ intendedItem, listingSnapshot: snapshot, now, allowLooseIdentity });
}

/** Alternative search is deliberately looser than the primary match: same category (and gender, if the intended item specifies one) is enough to be considered, since the exact item is already known to be unavailable. Brand/name still feed the score so a closer alternative always outranks a distant one. */
function candidateEligibleAsAlternative(intendedItem, listing, excludeListingId) {
  if (listing.listingId === excludeListingId) return false;
  if (intendedItem.category && listing.category !== intendedItem.category) return false;
  if (intendedItem.gender && intendedItem.gender !== 'unisex' && listing.gender && listing.gender !== 'unisex') {
    if (intendedItem.gender !== listing.gender) return false;
  }
  if (intendedItem.priceTier && listing.priceTier && intendedItem.priceTier !== listing.priceTier) return false;
  return true;
}

/**
 * Resolves one supporting-item reference end to end: gather candidates
 * from every configured adapter, score/classify them, verify the best
 * exact match, and — only if the exact item is confirmed unavailable
 * (dead/mismatched/out-of-stock/redirected/delisted) — attempt a clearly
 * labeled alternative within the same category/gender/price tier. An
 * ambiguous or absent match never triggers alternative search; it goes
 * straight to `needs-human` with the ranked evidence, since the engine
 * doesn't yet know what the "real" item even is.
 */
export async function resolveSupportingItem(intendedItem, adapters, { now, allowAlternative = true } = {}) {
  const candidates = await collectCandidates(adapters, { category: intendedItem.category, brand: intendedItem.brand });
  const match = matchCandidates(intendedItem, candidates);

  if (match.outcome !== 'exact') {
    return {
      outcome: 'needs-human',
      type: null,
      offer: null,
      matchScore: match.best ? match.best.score : null,
      reason: match.outcome === 'ambiguous' ? 'ambiguous-match' : 'no-candidate-found',
      evidence: match.ranked.slice(0, 5).map((r) => ({ listingId: r.listing.listingId, adapterId: r.listing.adapterId, score: Math.round(r.score * 100) / 100 })),
      reasons: match.reasons,
      intendedItem,
    };
  }

  const exactOffer = await verifyCandidate(intendedItem, match.best, adapters, { now });

  if (exactOffer.linkStatus === 'live') {
    return { outcome: 'verified', type: 'exact', offer: exactOffer, matchScore: match.best.score, reason: null, reasons: [], intendedItem };
  }

  if (!allowAlternative) {
    return {
      outcome: 'needs-human',
      type: null,
      offer: exactOffer,
      matchScore: match.best.score,
      reason: 'exact-item-unavailable',
      evidence: [{ listingId: exactOffer.listingId, linkStatus: exactOffer.linkStatus }],
      reasons: exactOffer.reasons,
      intendedItem,
    };
  }

  // Alternative eligibility is category/gender/price-tier "approved
  // alternative" fit, NOT identity match — an alternative is by
  // definition a different product, so it is never required to clear
  // link-engine-matcher's exact-identity threshold. `scoreCandidate` is
  // used only to rank among the approved pool (best editorial fit first),
  // never as an accept/reject gate here.
  const altCandidates = candidates.filter((listing) => candidateEligibleAsAlternative(intendedItem, listing, match.best.listing.listingId));

  if (altCandidates.length === 0) {
    return {
      outcome: 'needs-human',
      type: null,
      offer: exactOffer,
      matchScore: match.best.score,
      reason: 'exact-item-unavailable-no-alternative',
      evidence: [{ listingId: exactOffer.listingId, linkStatus: exactOffer.linkStatus }],
      reasons: [`exact item is ${exactOffer.linkStatus}`, ...exactOffer.reasons, 'no approved alternative (same category/gender/price tier) is available'],
      intendedItem,
    };
  }

  const rankedAlts = altCandidates
    .map((listing) => ({ listing, score: scoreCandidate(intendedItem, listing).score }))
    .sort((a, b) => b.score - a.score);
  const bestAlt = rankedAlts[0];

  const altOffer = await verifyCandidate(intendedItem, bestAlt, adapters, { now, allowLooseIdentity: true });
  if (altOffer.linkStatus !== 'live') {
    return {
      outcome: 'needs-human',
      type: null,
      offer: exactOffer,
      matchScore: match.best.score,
      reason: 'exact-item-unavailable-alternative-also-unverifiable',
      evidence: [
        { listingId: exactOffer.listingId, linkStatus: exactOffer.linkStatus },
        { listingId: altOffer.listingId, linkStatus: altOffer.linkStatus },
      ],
      reasons: [`exact item is ${exactOffer.linkStatus}`, `candidate alternative is also ${altOffer.linkStatus}`],
      intendedItem,
    };
  }

  return {
    outcome: 'verified',
    type: 'alternative',
    offer: altOffer,
    matchScore: bestAlt.score,
    reason: null,
    reasons: [`exact item was ${exactOffer.linkStatus} — substituted with a clearly labeled alternative`],
    originalItemStatus: exactOffer.linkStatus,
    intendedItem,
  };
}

/**
 * The same listing resolved as the offer for more than one distinct
 * intended item is a data-quality signal worth surfacing (e.g. two
 * different outfit slots both silently pointing at the same retailer
 * SKU) — reporting-only, never auto-corrected.
 */
export function detectDuplicateOffers(resolvedItems) {
  const byListing = new Map();
  for (const result of resolvedItems || []) {
    if (result.outcome !== 'verified' || !result.offer?.listingId) continue;
    const key = result.offer.listingId;
    if (!byListing.has(key)) byListing.set(key, []);
    byListing.get(key).push(result.intendedItem.outfitItemId);
  }
  return [...byListing.entries()]
    .filter(([, outfitItemIds]) => outfitItemIds.length > 1)
    .map(([listingId, outfitItemIds]) => ({ listingId, outfitItemIds }));
}

/** Resolves every item in an outfit and reports duplicate-offer collisions across the set. */
export async function runLinkEngineForOutfit(outfit, adapters, { now, allowAlternative = true } = {}) {
  const results = [];
  for (const item of outfit.items || []) {
    results.push(await resolveSupportingItem(item, adapters, { now, allowAlternative }));
  }
  return { outfitId: outfit.outfitId, results, duplicates: detectDuplicateOffers(results) };
}

/** What scripts/link-engine-verifier.mjs's re-verified linkStatus should do to a previously-stored offer record on scheduled revalidation. Never a silent no-op on a broken link. */
export function classifyRevalidationAction(reverifiedOffer) {
  if (!reverifiedOffer || reverifiedOffer.linkStatus === 'unavailable' || reverifiedOffer.linkStatus === 'dead') return 'removed';
  if (['redirected', 'mismatched', 'out-of-stock'].includes(reverifiedOffer.linkStatus)) return 'flagged';
  if (reverifiedOffer.linkStatus === 'live' && !isCoverageEligibleOffer(reverifiedOffer)) return 'flagged';
  return 'unchanged';
}

/**
 * Re-checks every stored offer record that's due (per `isStaleCheck`).
 * `removed`/`flagged` records are given one chance at alternative
 * substitution using the full current adapter set before being reported —
 * exactly the "automatically remove, replace, or flag" behavior the issue
 * asks for, never a silent drop. `storedOffers[].intendedItem` must be the
 * same intended-item record the offer was originally resolved from.
 */
export async function revalidateOfferRecords(storedOffers, adapters, { now, isStaleCheck, force = false } = {}) {
  const results = [];
  for (const record of storedOffers || []) {
    const due = force || (isStaleCheck ? isStaleCheck(record, { now }) : true);
    if (!due) {
      results.push({ ...record, action: 'unchanged' });
      continue;
    }

    const adapter = findAdapterById(adapters, record.adapterId);
    if (!adapter) {
      results.push({ ...record, action: 'flagged', flagReason: `adapter "${record.adapterId}" is no longer configured` });
      continue;
    }

    const snapshot = await adapter.verify(record.listingId);
    const reverified = verifyOffer({ intendedItem: record.intendedItem, listingSnapshot: snapshot, now });
    const action = classifyRevalidationAction(reverified);

    if (action === 'unchanged') {
      results.push({ ...reverified, intendedItem: record.intendedItem, action, previousLinkStatus: record.linkStatus });
      continue;
    }

    const resolution = await resolveSupportingItem(record.intendedItem, adapters, { now, allowAlternative: true });
    if (resolution.outcome === 'verified' && resolution.type === 'alternative') {
      results.push({
        ...resolution.offer,
        intendedItem: record.intendedItem,
        action: 'replaced',
        previousLinkStatus: record.linkStatus,
        reasons: resolution.reasons,
      });
    } else {
      results.push({ ...reverified, intendedItem: record.intendedItem, action, previousLinkStatus: record.linkStatus });
    }
  }
  return results;
}
