#!/usr/bin/env node
// Controlled OpenAI image renderer pilot (issue #18, "Pilot" section).
// Runs the complete hybrid pipeline — prompt compilation, draft+final
// generation, cost/rate controls, reference-preservation QA, deterministic
// compositing, and the existing Guide Factory content-quality gate —
// against the isolated fixture manifest in
// scripts/__fixtures__/guide-jobs.mjs (OPENAI_PILOT_MANIFEST), exactly
// like scripts/simulate-guide-factory.mjs, but for the image renderer.
//
// This is a SIMULATION, not a live run: the provider call is an injected
// fake (deterministic fake image bytes, no network, no OPENAI_API_KEY, $0
// real spend) for two reasons, both explicit in the epic:
//   1. "Do not run unrestricted paid generation" / "stop before
//      publishing" — an autonomous agent session is not the place to
//      authorize a real charge against a real, freshly-provisioned
//      secret with no human present to confirm the actual spend.
//   2. This environment's own permitted tool allowlist has no network
//      egress to api.openai.com (see .github/workflows/claude.yml) — a
//      real call could not succeed here even if attempted.
// scripts/openai-renderer-cli.mjs is the real, live-capable entry point
// (env-only key, `--live` opt-in) for a maintainer to run once ready.
//
// Also demonstrates — and regression-guards — the single most important
// safety property of this epic: a generated image is NEVER accepted
// without a vision-QA signal. Since no automated vision pass exists in
// this dependency-free repo (scripts/reference-preservation-check.mjs),
// every OpenAI-hybrid slide in this simulation is expected to land at
// `needs-human`, not `ready-for-pr` — exit code 1 if that ever stops
// being true, since that would mean the pipeline started silently
// accepting unverified generative output.
//
// Usage:
//   node scripts/simulate-openai-pilot.mjs

import { renderSlideDeterministic } from './guide-renderer-adapter.mjs';
import { renderSlidesOpenAiHybrid } from './openai-hybrid-renderer.mjs';
import { runGuideFactoryJob } from './guide-factory.mjs';
import { sumSpend } from './openai-cost-controls.mjs';
import {
  FIXTURE_PRODUCT_IDS,
  FIXTURE_EXISTING_GUIDES,
  OPENAI_PILOT_MANIFEST,
  OPENAI_PILOT_HERO_PRODUCT,
  NOW,
} from './__fixtures__/guide-jobs.mjs';

// A tiny, valid 1x1 transparent PNG, base64-encoded — stands in for a real
// generated image byte-for-byte deterministically, so this simulation
// never depends on network access or real API output.
const FAKE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function fakeGenerateImageFn({ prompt, size, quality, now }) {
  return {
    status: 'generated',
    errorType: null,
    imageBase64: FAKE_IMAGE_BASE64,
    revisedPrompt: `simulated: ${OPENAI_PILOT_HERO_PRODUCT.colorway} shell — ${prompt.slice(0, 40)}...`,
    model: 'gpt-image-2-simulated',
    size,
    quality,
    requestId: null,
    usage: null,
    timestampIso: now,
  };
}

const DETERMINISTIC_ORDERS = new Set([1, OPENAI_PILOT_MANIFEST.slides.length]);
// Approved pilot defaults: 1080x1080, not the guide factory's default
// 1080x1350 (scripts/guide-factory.mjs's generateSlideSpecs()) — the pilot
// builds its own slide specs directly rather than through that function so
// the export dimensions match what was explicitly approved for this
// epic's carousel, without changing the unrelated existing default other
// guides still render at.
const slideSpecs = OPENAI_PILOT_MANIFEST.slides.map((s) => ({
  order: s.order,
  label: s.label,
  copy: s.copy,
  altText: s.altText,
  width: 1080,
  height: 1080,
}));

const deterministicSlides = slideSpecs.filter((s) => DETERMINISTIC_ORDERS.has(s.order));
const hybridSlides = slideSpecs.filter((s) => !DETERMINISTIC_ORDERS.has(s.order));

const deterministicResults = deterministicSlides.map((spec) => ({
  slideOrder: spec.order,
  ...renderSlideDeterministic(spec),
}));

const hybridResults = await renderSlidesOpenAiHybrid(hybridSlides, {
  apiKey: 'sk-simulated-not-a-real-key',
  generateImageFn: fakeGenerateImageFn,
  sleepImpl: () => Promise.resolve(),
  manifest: OPENAI_PILOT_MANIFEST,
  heroProduct: OPENAI_PILOT_HERO_PRODUCT,
  referenceImageBase64: FAKE_IMAGE_BASE64, // simulates a verified reference image being supplied
  now: NOW,
  size: '1024x1024',
  // Deliberately no visionSignalsBySlide — see header comment: this
  // simulation proves the pipeline defaults to needs-human, not accept.
});

const renderedAssets = [...deterministicResults, ...hybridResults].sort((a, b) => a.slideOrder - b.slideOrder);

const factoryResult = runGuideFactoryJob(OPENAI_PILOT_MANIFEST, {
  existingProductIds: FIXTURE_PRODUCT_IDS,
  existingGuides: FIXTURE_EXISTING_GUIDES,
  now: NOW,
  precomputedRenderedAssets: renderedAssets,
});

const finalLedger = hybridResults.length ? hybridResults[hybridResults.length - 1].ledger || [] : [];
const spendEvidence = {
  perGuideSpentUsd: Number(sumSpend(finalLedger, { guideId: OPENAI_PILOT_MANIFEST.jobId, scope: 'guide' }).toFixed(4)),
  monthlySpentUsd: Number(sumSpend(finalLedger, { now: NOW, scope: 'month' }).toFixed(4)),
  note: 'Simulated provider — this is the pre-flight cost-estimate ledger only; $0 real money was spent (no network call was made).',
};

const evidence = {
  jobId: OPENAI_PILOT_MANIFEST.jobId,
  outcome: factoryResult.outcome,
  stage: factoryResult.stage,
  slides: renderedAssets.map((a) => ({
    slideOrder: a.slideOrder,
    mode: a.mode,
    status: a.status,
    reason: a.reason || null,
    hasVisualEvidence: Boolean(a.content || a.previewContent),
  })),
  spend: spendEvidence,
  reasons: factoryResult.reasons,
};

console.log(JSON.stringify(evidence, null, 2));

const hybridSlidesAllNeedHuman = hybridResults.every((r) => r.status === 'blocked' && r.stage && r.stage.endsWith('visual-qa'));
if (factoryResult.outcome === 'ready-for-pr' || !hybridSlidesAllNeedHuman) {
  console.error(
    '\n✗ Simulation FAILED — a generated slide with no vision-QA signal was accepted (or the pipeline reached ' +
      'ready-for-pr) instead of stopping at needs-human. This would be a real regression in the "never silently ' +
      'accept an uncertain generative result" safety property.'
  );
  process.exit(1);
}

console.log(
  '\n✓ Controlled pilot ran end-to-end with no human prompt relay: draft+final generation, cost/rate controls, ' +
    'and deterministic compositing all succeeded for every editorial slide, and — exactly as required — every one ' +
    'of them correctly stopped at needs-human pending human visual review instead of being silently accepted. ' +
    'Nothing was published; no real API call or spend occurred.'
);
