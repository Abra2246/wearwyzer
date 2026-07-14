import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, matchCandidates, EXACT_MATCH_THRESHOLD, AMBIGUOUS_MATCH_FLOOR } from '../link-engine-matcher.mjs';
import {
  EXACT_MATCH_ITEM,
  AMBIGUOUS_ITEM,
  NO_MATCH_ITEM,
  RETAILER_ADAPTER,
  FEED_ADAPTER,
} from '../__fixtures__/link-engine.mjs';

test('scoreCandidate gives a perfect score to a canonical-id match regardless of noisy fields', () => {
  const { score } = scoreCandidate(EXACT_MATCH_ITEM, {
    canonicalId: EXACT_MATCH_ITEM.canonicalId,
    brand: EXACT_MATCH_ITEM.brand,
    name: 'Some Completely Different Title',
    category: EXACT_MATCH_ITEM.category,
  });
  assert.equal(score, 1);
});

test('scoreCandidate zeroes out a gender-mismatched candidate', () => {
  const { score, genderMismatch } = scoreCandidate(
    { ...EXACT_MATCH_ITEM, canonicalId: null },
    { brand: EXACT_MATCH_ITEM.brand, name: EXACT_MATCH_ITEM.name, category: EXACT_MATCH_ITEM.category, gender: 'women' }
  );
  assert.equal(genderMismatch, true);
  assert.equal(score, 0);
});

test('matchCandidates classifies a canonical-id, well-separated candidate as exact', async () => {
  const candidates = await RETAILER_ADAPTER.search({ category: EXACT_MATCH_ITEM.category });
  const result = matchCandidates(EXACT_MATCH_ITEM, candidates);
  assert.equal(result.outcome, 'exact');
  assert.equal(result.best.listing.listingId, 'rt-belt-001');
});

test('matchCandidates classifies two close competing candidates as ambiguous, with evidence for both', async () => {
  const retailerCandidates = await RETAILER_ADAPTER.search({ category: AMBIGUOUS_ITEM.category });
  const feedCandidates = await FEED_ADAPTER.search({ category: AMBIGUOUS_ITEM.category });
  const result = matchCandidates(AMBIGUOUS_ITEM, [...retailerCandidates, ...feedCandidates]);
  assert.equal(result.outcome, 'ambiguous');
  assert.equal(result.best, null);
  assert.equal(result.ranked.length, 2);
  assert.ok(result.reasons.length > 0);
});

test('matchCandidates classifies an empty-recall category as no-match', async () => {
  const candidates = await RETAILER_ADAPTER.search({ category: NO_MATCH_ITEM.category });
  const result = matchCandidates(NO_MATCH_ITEM, candidates);
  assert.equal(result.outcome, 'no-match');
  assert.equal(result.best, null);
  assert.match(result.reasons[0], /no candidate listings/);
});

test('matchCandidates never returns exact below the configured threshold', () => {
  const result = matchCandidates(EXACT_MATCH_ITEM, [
    { listingId: 'weak', brand: 'Completely Different Brand', name: 'Nothing Alike', category: 'belts' },
  ]);
  assert.notEqual(result.outcome, 'exact');
  assert.ok(result.ranked[0].score < EXACT_MATCH_THRESHOLD);
});

test('a lone strong candidate with no runner-up is still exact (nothing to be ambiguous against)', () => {
  const result = matchCandidates(EXACT_MATCH_ITEM, [
    {
      listingId: 'only-one',
      brand: EXACT_MATCH_ITEM.brand,
      name: EXACT_MATCH_ITEM.name,
      category: EXACT_MATCH_ITEM.category,
      color: EXACT_MATCH_ITEM.color,
      material: EXACT_MATCH_ITEM.material,
      canonicalId: EXACT_MATCH_ITEM.canonicalId,
    },
  ]);
  assert.equal(result.outcome, 'exact');
});

test('AMBIGUOUS_MATCH_FLOOR and EXACT_MATCH_THRESHOLD are ordered sanely', () => {
  assert.ok(AMBIGUOUS_MATCH_FLOOR < EXACT_MATCH_THRESHOLD);
});
