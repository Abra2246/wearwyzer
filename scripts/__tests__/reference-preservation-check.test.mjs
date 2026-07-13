import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSlidePreservation, evaluateHeroConsistencyAcrossSlides } from '../reference-preservation-check.mjs';

const GENERATED = { status: 'generated', revisedPrompt: 'a moss green shell', requestedLegibleFinalText: false };

test('rejects when the provider did not successfully generate', () => {
  const result = evaluateSlidePreservation({ generationResult: { status: 'blocked', reason: 'rate limited' } });
  assert.equal(result.verdict, 'reject');
});

test('rejects when no reference image was supplied for a hero-involving slide', () => {
  const result = evaluateSlidePreservation({
    generationResult: GENERATED,
    heroProduct: { involvesHero: true },
    referenceImageSupplied: false,
  });
  assert.equal(result.verdict, 'reject');
  assert.deepEqual(result.reasons, ['no-reference-image-supplied']);
});

test('defaults to needs-human when generation succeeds but no vision signal exists — never a silent accept', () => {
  const result = evaluateSlidePreservation({
    generationResult: GENERATED,
    heroProduct: { involvesHero: true },
    referenceImageSupplied: true,
    visionSignals: null,
  });
  assert.equal(result.verdict, 'needs-human');
});

test('rejects with specific reasons when vision signals flag a pixel-level problem', () => {
  const result = evaluateSlidePreservation({
    generationResult: GENERATED,
    heroProduct: { involvesHero: true },
    referenceImageSupplied: true,
    visionSignals: { wrongColorway: true, garmentArtifact: true },
  });
  assert.equal(result.verdict, 'reject');
  assert.deepEqual(result.reasons.sort(), ['duplicated-limbs-or-garment-artifact', 'wrong-colorway']);
});

test('accepts only when generation succeeded, no structural violation, and vision signals clear every category', () => {
  const result = evaluateSlidePreservation({
    generationResult: GENERATED,
    heroProduct: { involvesHero: true },
    referenceImageSupplied: true,
    visionSignals: { wrongColorway: false, changedSilhouette: false, heroItemMissing: false, garmentArtifact: false, embeddedText: false },
  });
  assert.equal(result.verdict, 'accept');
});

test('evaluateHeroConsistencyAcrossSlides flags an inconsistent hero product', () => {
  const result = evaluateHeroConsistencyAcrossSlides([
    { accepted: true, heroProductId: 'fx-hero-jacket-b' },
    { accepted: true, heroProductId: 'fx-hero-jacket' },
    { accepted: false, heroProductId: 'ignored-because-not-accepted' },
  ]);
  assert.equal(result.verdict, 'needs-human');
  assert.match(result.reasons[0], /inconsistent-hero-across-slides/);
});

test('evaluateHeroConsistencyAcrossSlides accepts when every accepted slide agrees', () => {
  const result = evaluateHeroConsistencyAcrossSlides([
    { accepted: true, heroProductId: 'fx-hero-jacket-b' },
    { accepted: true, heroProductId: 'fx-hero-jacket-b' },
  ]);
  assert.equal(result.verdict, 'accept');
});
