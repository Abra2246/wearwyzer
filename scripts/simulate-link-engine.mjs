#!/usr/bin/env node
// Verified supporting-item link engine v1 (issue #24) — end-to-end
// simulation, the same role scripts/simulate-guide-factory.mjs plays for
// the guide factory: proof that the full pipeline (adapters -> matcher ->
// verifier -> coverage -> revalidation) resolves a realistic mixed-outcome
// outfit correctly, running entirely against the isolated fixture universe
// in scripts/__fixtures__/link-engine.mjs — never against real product
// data, never with a live credential.
//
// Usage:
//   node scripts/simulate-link-engine.mjs
//
// Exit code 0 = every fixture scenario resolved to its expected outcome.
// Exit code 1 = a regression in the pipeline (this fixture is designed to
// exercise, and pass, every scenario the issue names).

import { resolveSupportingItem, runLinkEngineForOutfit, revalidateOfferRecords } from './link-engine.mjs';
import { isStale } from './link-engine-verifier.mjs';
import { computeGuideCoverage, computePortfolioCoverage, logCoverageShortfall } from './link-engine-coverage.mjs';
import {
  EXACT_MATCH_ITEM,
  AMBIGUOUS_ITEM,
  NO_MATCH_ITEM,
  DEAD_LINK_ITEM,
  OUT_OF_STOCK_ITEM,
  DIRECT_BRAND_ITEM,
  DUP_ITEM_A,
  DUP_ITEM_B,
  INITIAL_ADAPTERS,
  LATER_ADAPTERS,
  STORED_OFFER_RECORDS,
  FIXTURE_NOW,
  FIXTURE_LATER,
} from './__fixtures__/link-engine.mjs';

const failures = [];

function check(label, condition, detail) {
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return condition;
}

async function main() {
  const outfit = {
    outfitId: 'fx-simulated-outfit',
    items: [EXACT_MATCH_ITEM, AMBIGUOUS_ITEM, NO_MATCH_ITEM, DEAD_LINK_ITEM, OUT_OF_STOCK_ITEM, DIRECT_BRAND_ITEM, DUP_ITEM_A, DUP_ITEM_B],
  };
  const runResult = await runLinkEngineForOutfit(outfit, INITIAL_ADAPTERS, { now: FIXTURE_NOW });
  const byOutfitItemId = Object.fromEntries(runResult.results.map((r) => [r.intendedItem.outfitItemId, r]));

  check('exact match resolves verified/exact', byOutfitItemId[EXACT_MATCH_ITEM.outfitItemId].outcome === 'verified' && byOutfitItemId[EXACT_MATCH_ITEM.outfitItemId].type === 'exact');
  check('ambiguous item becomes needs-human', byOutfitItemId[AMBIGUOUS_ITEM.outfitItemId].outcome === 'needs-human' && byOutfitItemId[AMBIGUOUS_ITEM.outfitItemId].reason === 'ambiguous-match');
  check('no-candidate item becomes needs-human', byOutfitItemId[NO_MATCH_ITEM.outfitItemId].outcome === 'needs-human' && byOutfitItemId[NO_MATCH_ITEM.outfitItemId].reason === 'no-candidate-found');
  check('dead link resolves to a labeled alternative', byOutfitItemId[DEAD_LINK_ITEM.outfitItemId].outcome === 'verified' && byOutfitItemId[DEAD_LINK_ITEM.outfitItemId].type === 'alternative');
  check('out-of-stock with no alternative becomes needs-human', byOutfitItemId[OUT_OF_STOCK_ITEM.outfitItemId].outcome === 'needs-human');
  check('brand-direct exact match verifies live but non-affiliate', byOutfitItemId[DIRECT_BRAND_ITEM.outfitItemId].offer?.linkStatus === 'live' && byOutfitItemId[DIRECT_BRAND_ITEM.outfitItemId].offer?.affiliateEligible === false);
  check('duplicate offer across two outfit items is detected', runResult.duplicates.length === 1 && runResult.duplicates[0].listingId === 'rt-sunglasses-050');

  const coverage = computeGuideCoverage('fx-simulated-outfit', runResult.results);
  check('coverage below the 80% target on this deliberately mixed fixture', coverage.meetsTarget === false, `coveragePct=${coverage.coveragePct}`);
  const shortfall = logCoverageShortfall(coverage, runResult.results, { now: FIXTURE_NOW });
  check('a shortfall is logged with percentage and reasons', Boolean(shortfall) && shortfall.reasons.length > 0);
  const portfolio = computePortfolioCoverage([coverage]);
  check('portfolio coverage rolls up from the single simulated guide', portfolio.totalItems === coverage.totalItems);

  const revalidated = await revalidateOfferRecords(Object.values(STORED_OFFER_RECORDS), LATER_ADAPTERS, {
    now: FIXTURE_LATER,
    isStaleCheck: (record, ctx) => isStale(record, ctx),
  });
  const actionsByListingId = Object.fromEntries(revalidated.map((r) => [r.listingId || r.previousLinkStatus + '-unavailable', r.action]));
  check('revalidation removes a since-dead link', revalidated.find((r) => r.previousLinkStatus === 'live' && r.action === 'removed') !== undefined);
  check('revalidation flags a since-redirected link', revalidated.some((r) => r.action === 'flagged' && r.linkStatus === 'redirected'));
  check('revalidation flags a since-ineligible-but-live link', revalidated.some((r) => r.action === 'flagged' && r.linkStatus === 'live' && r.affiliateEligible === false));
  check('revalidation replaces a since-out-of-stock link with a fresh alternative', revalidated.some((r) => r.action === 'replaced'));

  const evidence = {
    outfitResults: runResult.results.map((r) => ({ outfitItemId: r.intendedItem.outfitItemId, outcome: r.outcome, type: r.type, reason: r.reason || null })),
    duplicates: runResult.duplicates,
    coverage,
    shortfall,
    portfolio,
    revalidation: revalidated.map((r) => ({ listingId: r.listingId, action: r.action, previousLinkStatus: r.previousLinkStatus, linkStatus: r.linkStatus })),
  };
  console.log(JSON.stringify(evidence, null, 2));

  if (failures.length > 0) {
    console.error('\n✗ Simulation FAILED — the following scenarios did not resolve as expected:');
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log('\n✓ Every fixture scenario (exact match, ambiguity, no-match, dead link + alternative, out-of-stock, duplicate offer, coverage shortfall, redirect/staleness/affiliate-loss/out-of-stock revalidation) resolved as expected.');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
