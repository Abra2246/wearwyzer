import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHeroCandidates, renderHeroCandidateReport } from '../hero-candidate-assessor.mjs';

const NOW = '2026-07-21T00:00:00.000Z';

const PRODUCTS = [
  // Blocked: no sourceUrl, and its guide was published inside the cooldown window.
  {
    id: 'shoe-a',
    name: 'Shoe A',
    profile: { type: 'sneaker' },
  },
  // Blocked only by missing sourceUrl — no guide claims it as hero.
  {
    id: 'shoe-b',
    name: 'Shoe B',
    profile: { type: 'sneaker' },
  },
  // Eligible: has a real sourceUrl and no cooldown conflict.
  {
    id: 'shoe-c',
    name: 'Shoe C',
    profile: { type: 'sneaker' },
    sourceUrl: 'https://example.com/verified-source/shoe-c',
  },
  // Not a candidate at all — no styling profile.
  { id: 'plain-tee', name: 'Plain Tee' },
];

const GUIDES = [
  {
    id: 'guide-a',
    publishedDate: '2026-07-10',
    outfits: [
      { items: [{ productId: 'shoe-a' }, { productId: 'plain-tee' }] },
      { items: [{ productId: 'shoe-a' }] },
    ],
  },
];

test('assessHeroCandidates only considers products with a styling profile', () => {
  const assessment = assessHeroCandidates({ products: PRODUCTS, guides: GUIDES, now: NOW });
  const ids = assessment.candidates.map((c) => c.productId);
  assert.ok(!ids.includes('plain-tee'));
  assert.equal(ids.length, 3);
});

test('a product whose guide was published within the cooldown window is blocked', () => {
  const assessment = assessHeroCandidates({ products: PRODUCTS, guides: GUIDES, now: NOW });
  const shoeA = assessment.candidates.find((c) => c.productId === 'shoe-a');
  assert.equal(shoeA.heroCooldownBlocked, true);
  assert.deepEqual(shoeA.cooldownConflicts, ['guide-a']);
  assert.equal(shoeA.eligible, false);
});

test('a product with no captured sourceUrl is blocked even outside the cooldown window', () => {
  const assessment = assessHeroCandidates({ products: PRODUCTS, guides: GUIDES, now: NOW });
  const shoeB = assessment.candidates.find((c) => c.productId === 'shoe-b');
  assert.equal(shoeB.heroCooldownBlocked, false);
  assert.equal(shoeB.hasVerifiableSource, false);
  assert.equal(shoeB.eligible, false);
  assert.ok(shoeB.reasons[0].includes('no verifiable source URL'));
});

test('a product with a real sourceUrl and no cooldown conflict is eligible', () => {
  const assessment = assessHeroCandidates({ products: PRODUCTS, guides: GUIDES, now: NOW });
  const shoeC = assessment.candidates.find((c) => c.productId === 'shoe-c');
  assert.equal(shoeC.hasVerifiableSource, true);
  assert.equal(shoeC.eligible, true);
  assert.equal(assessment.anyEligible, true);
  assert.equal(assessment.eligibleCount, 1);
});

test('renderHeroCandidateReport names every ineligible candidate with its concrete reason when nothing is eligible', () => {
  const assessment = assessHeroCandidates({ products: PRODUCTS.slice(0, 2), guides: GUIDES, now: NOW });
  assert.equal(assessment.anyEligible, false);
  const report = renderHeroCandidateReport(assessment);
  assert.match(report, /No hero-eligible product/);
  assert.match(report, /shoe-a/);
  assert.match(report, /shoe-b/);
  assert.match(report, /Next action:/);
});

test('renderHeroCandidateReport names the eligible candidates when at least one exists', () => {
  const assessment = assessHeroCandidates({ products: PRODUCTS, guides: GUIDES, now: NOW });
  const report = renderHeroCandidateReport(assessment);
  assert.match(report, /1 hero candidate\(s\) eligible/);
  assert.match(report, /shoe-c/);
});
