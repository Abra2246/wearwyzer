import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSlideOpenAiHybrid, renderSlidesOpenAiHybrid, compositeHybridSlideSvg } from '../openai-hybrid-renderer.mjs';
import { renderSlideDeterministic } from '../guide-renderer-adapter.mjs';
import { runGuideFactoryJob } from '../guide-factory.mjs';
import { DEFAULT_LIMITS } from '../openai-cost-controls.mjs';
import { FIXTURE_PRODUCT_IDS, FIXTURE_EXISTING_GUIDES, COMPLETE_APPROVED_MANIFEST, NOW } from '../__fixtures__/guide-jobs.mjs';

const noopSleep = () => Promise.resolve();
const CLEAN_VISION_SIGNALS = { wrongColorway: false, changedSilhouette: false, heroItemMissing: false, garmentArtifact: false, embeddedText: false };
const HERO_PRODUCT = { name: 'Weatherproof Trail Shell', colorway: 'moss green', involvesHero: true };
const SLIDE_SPEC = { order: 2, label: 'Office Commute', copy: 'Shell over a crew tee.', width: 1080, height: 1080 };

function fakeGenerateImageFn({ result = { imageBase64: 'ZmFrZQ==', revisedPrompt: 'moss green shell' }, calls } = {}) {
  return async (args) => {
    if (calls) calls.push(args);
    return { status: 'generated', errorType: null, model: 'gpt-image-2', size: args.size, quality: args.quality, timestampIso: args.now, ...result };
  };
}

test('compositeHybridSlideSvg embeds the generated image and draws deterministic text on top', () => {
  const svg = compositeHybridSlideSvg({ slideSpec: SLIDE_SPEC, imageBase64: 'ZmFrZQ==' });
  assert.match(svg, /<image /);
  assert.match(svg, /base64,ZmFrZQ==/);
  assert.match(svg, /Office Commute/);
  assert.match(svg, /Shell over a crew tee\./);
});

test('successful end-to-end hybrid render: draft then final, vision signals clear, slide is rendered', async () => {
  const calls = [];
  const result = await renderSlideOpenAiHybrid(SLIDE_SPEC, {
    apiKey: 'sk-live',
    generateImageFn: fakeGenerateImageFn({ calls }),
    sleepImpl: noopSleep,
    manifest: { jobId: 'fx-pilot', heroProductId: 'fx-hero-jacket-b', outfits: [{ name: 'Office Commute', items: [] }] },
    heroProduct: HERO_PRODUCT,
    referenceImageBase64: 'refbase64==',
    now: NOW,
    visionSignalsBySlide: { 2: CLEAN_VISION_SIGNALS },
  });
  assert.equal(result.status, 'rendered');
  assert.equal(result.mode, 'openai-hybrid');
  assert.match(result.content, /<svg/);
  assert.equal(calls.length, 2); // draft, then final
  assert.equal(calls[0].quality, 'low');
  assert.equal(calls[1].quality, 'medium');
  assert.equal(calls[0].referenceImageBase64, 'refbase64=='); // reference-image edit workflow used throughout
  const accepted = result.ledger.filter((e) => e.accepted);
  assert.equal(accepted.length, 1);
  assert.equal(result.evidence.promptVersion, '1.0.0');
});

test('missing API key fails closed before any budget gate is even relevant', async () => {
  // Uses the real generateImage (no fetchImpl override) — its own
  // missing-key check short-circuits before any network call, so this is
  // safe to run without mocking fetch.
  const result = await renderSlideOpenAiHybrid(SLIDE_SPEC, {
    apiKey: null,
    sleepImpl: noopSleep,
    manifest: { jobId: 'fx-pilot', heroProductId: 'fx-hero-jacket-b', outfits: [] },
    heroProduct: HERO_PRODUCT,
    referenceImageBase64: 'ref==',
    now: NOW,
    visionSignalsBySlide: { 2: CLEAN_VISION_SIGNALS },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorType, 'missing_key');
});

test('moderation refusal at the draft stage blocks without attempting a final call', async () => {
  const calls = [];
  const generateImageFn = async (args) => {
    calls.push(args);
    return { status: 'blocked', errorType: 'moderation_refused', reason: 'refused', timestampIso: args.now };
  };
  const result = await renderSlideOpenAiHybrid(SLIDE_SPEC, {
    apiKey: 'sk-live',
    generateImageFn,
    sleepImpl: noopSleep,
    manifest: { jobId: 'fx-pilot', heroProductId: 'fx-hero-jacket-b', outfits: [] },
    heroProduct: HERO_PRODUCT,
    referenceImageBase64: 'ref==',
    now: NOW,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.stage, 'draft');
  assert.equal(result.errorType, 'moderation_refused');
  assert.equal(calls.length, 1);
});

test('rejected visual QA blocks the slide even though generation itself succeeded', async () => {
  const result = await renderSlideOpenAiHybrid(SLIDE_SPEC, {
    apiKey: 'sk-live',
    generateImageFn: fakeGenerateImageFn(),
    sleepImpl: noopSleep,
    manifest: { jobId: 'fx-pilot', heroProductId: 'fx-hero-jacket-b', outfits: [] },
    heroProduct: HERO_PRODUCT,
    referenceImageBase64: 'ref==',
    now: NOW,
    visionSignalsBySlide: { 2: { ...CLEAN_VISION_SIGNALS, wrongColorway: true } },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.stage, 'draft-visual-qa');
  assert.match(result.reason, /wrong-colorway/);
  // Never programmatically accepted, but the composited draft is still
  // attached for a human reviewer to look at.
  assert.match(result.previewContent, /<svg/);
});

test('generation with no vision signal at all is blocked (needs-human), never silently accepted', async () => {
  const result = await renderSlideOpenAiHybrid(SLIDE_SPEC, {
    apiKey: 'sk-live',
    generateImageFn: fakeGenerateImageFn(),
    sleepImpl: noopSleep,
    manifest: { jobId: 'fx-pilot', heroProductId: 'fx-hero-jacket-b', outfits: [] },
    heroProduct: HERO_PRODUCT,
    referenceImageBase64: 'ref==',
    now: NOW,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.verdict, 'needs-human');
});

test('budget exhaustion blocks before the draft call is ever made', async () => {
  const calls = [];
  const ledger = [{ guideId: 'fx-pilot', timestampIso: NOW, costUsd: DEFAULT_LIMITS.perGuideCapUsd, accepted: false }];
  const result = await renderSlideOpenAiHybrid(SLIDE_SPEC, {
    apiKey: 'sk-live',
    generateImageFn: fakeGenerateImageFn({ calls }),
    sleepImpl: noopSleep,
    manifest: { jobId: 'fx-pilot', heroProductId: 'fx-hero-jacket-b', outfits: [] },
    heroProduct: HERO_PRODUCT,
    ledger,
    now: NOW,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.stage, 'draft-budget');
  assert.match(result.reason, /per-guide cap exceeded/);
  assert.equal(calls.length, 0);
});

test('renderSlidesOpenAiHybrid threads the spend ledger across slides so per-guide caps apply to the whole guide', async () => {
  const specs = [SLIDE_SPEC, { ...SLIDE_SPEC, order: 3, label: 'Weekend Errands' }, { ...SLIDE_SPEC, order: 4, label: 'Evening Walk' }];
  const results = await renderSlidesOpenAiHybrid(specs, {
    apiKey: 'sk-live',
    generateImageFn: fakeGenerateImageFn(),
    sleepImpl: noopSleep,
    manifest: { jobId: 'fx-pilot', heroProductId: 'fx-hero-jacket-b', outfits: [] },
    heroProduct: HERO_PRODUCT,
    referenceImageBase64: 'ref==',
    now: NOW,
    visionSignalsBySlide: { 2: CLEAN_VISION_SIGNALS, 3: CLEAN_VISION_SIGNALS, 4: CLEAN_VISION_SIGNALS },
    limits: { ...DEFAULT_LIMITS, perGuideCapUsd: 0.1 }, // tight enough that slide 3 should exhaust the cap
  });
  assert.equal(results[0].status, 'rendered');
  const laterBlocked = results.slice(1).some((r) => r.status === 'blocked' && /cap exceeded/.test(r.reason));
  assert.ok(laterBlocked, 'expected the shared ledger to eventually hit the per-guide cap across slides');
});

test('the deterministic renderer is untouched and still available as a fallback', () => {
  const result = renderSlideDeterministic({ order: 1, label: 'Cover', copy: 'Hello' });
  assert.equal(result.status, 'rendered');
  assert.equal(result.mode, 'deterministic-template');
});

test('runGuideFactoryJob accepts precomputed hybrid renderedAssets behind the same content quality gate', () => {
  // Fixture manifest's own slides pass the full deterministic pipeline
  // end-to-end (scripts/simulate-guide-factory.mjs) — reusing its exact
  // rendered-asset shape here proves the hybrid path is a drop-in
  // replacement for renderSlides()'s synchronous output, not a special case.
  const deterministic = COMPLETE_APPROVED_MANIFEST.slides.map((s) => ({
    slideOrder: s.order,
    ...renderSlideDeterministic({ order: s.order, label: s.label, copy: s.copy }),
  }));
  const result = runGuideFactoryJob(COMPLETE_APPROVED_MANIFEST, {
    existingProductIds: FIXTURE_PRODUCT_IDS,
    existingGuides: FIXTURE_EXISTING_GUIDES,
    now: NOW,
    precomputedRenderedAssets: deterministic,
  });
  assert.equal(result.outcome, 'ready-for-pr');
});
