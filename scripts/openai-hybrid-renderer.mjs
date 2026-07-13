// Hybrid OpenAI + deterministic slide renderer (issue #18, sections 3, 6,
// and "Integrate the provider behind the existing Guide Factory adapter").
//
// scripts/guide-renderer-adapter.mjs stays exactly as it was designed in
// issue #17: pure, synchronous, no network, no credentials — its own
// header says so and every existing test assumes a plain synchronous
// return value (renderSlides() is called without await everywhere in
// scripts/guide-factory.mjs and its tests). A real OpenAI call is
// inherently async network I/O, so this module does not try to force
// that through the synchronous adapter's `renderSlide`/`renderSlides`
// contract — it produces the *same-shaped* result
// (`{ slideOrder, mode, format, status, content }`) via its own async
// pipeline, and the caller feeds that array into
// scripts/guide-factory.mjs's `runGuideFactoryJob` via the additive
// `precomputedRenderedAssets` parameter. Every downstream check (content
// quality policy, asset naming/existence) applies identically regardless
// of which renderer produced the array — that is what "integrated behind
// the existing Guide Factory adapter" means here: same contract, same
// consumer, different (necessarily async) producer for image-generation
// slides only.
//
// Never rejects an uncertain result — reference-preservation and budget
// checks always fail closed to `status: 'blocked'` with a specific
// reason (never a guessed accept). Never logs the API key (it only ever
// flows through as an opaque `apiKey` string into
// scripts/openai-image-provider.mjs).
//
// Canonical spec: docs/OPENAI_IMAGE_RENDERER_V1.md

import { generateImage, isRetryableErrorType } from './openai-image-provider.mjs';
import { compileEditorialPrompt } from './openai-prompt-compiler.mjs';
import { evaluateAttempt, estimateCost, recordSpend, computeBackoffDelayMs, DEFAULT_LIMITS } from './openai-cost-controls.mjs';
import { evaluateSlidePreservation } from './reference-preservation-check.mjs';
import { PALETTE, escapeXml } from './guide-renderer-adapter.mjs';

export const RENDERER_MODE = 'openai-hybrid';

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blockedResult(reason, extra = {}) {
  return { mode: RENDERER_MODE, format: null, status: 'blocked', content: null, reason, ...extra };
}

/**
 * Deterministic compositor: the AI-generated editorial image fills the
 * frame, and every piece of final copy (slide number, label, direction
 * copy) is drawn as real SVG text on top — never image-model text. Same
 * palette/typography as scripts/guide-renderer-adapter.mjs's deterministic
 * template, so a hybrid slide and a fully-deterministic slide read as one
 * visual system.
 */
export function compositeHybridSlideSvg({ slideSpec, imageBase64 }) {
  const { label = '', copy = '', order = 1, width = 1080, height = 1080 } = slideSpec;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,${imageBase64}"/>`,
    `<rect x="0" y="${height - 220}" width="${width}" height="220" fill="${PALETTE.ink}" fill-opacity="0.55"/>`,
    `<text x="48" y="${height - 150}" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="24" fill="${PALETTE.accent}" letter-spacing="4">${escapeXml(
      String(order).padStart(2, '0')
    )}</text>`,
    `<text x="48" y="${height - 100}" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="40" fill="${PALETTE.surface}">${escapeXml(label)}</text>`,
    `<text x="48" y="${height - 60}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="22" fill="${PALETTE.surface}">${escapeXml(copy)}</text>`,
    '</svg>',
  ].join('');
}

/** Calls the provider with retry-with-backoff for transient errors only, up to maxAttempts. */
async function callWithRetry({ generateImageFn, sleepImpl, maxAttempts, ...generateArgs }) {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const result = await generateImageFn(generateArgs);
    if (result.status === 'generated') return { result, attempts: attempt };
    if (!isRetryableErrorType(result.errorType) || attempt >= maxAttempts) {
      return { result, attempts: attempt };
    }
    await sleepImpl(computeBackoffDelayMs(attempt));
  }
}

/**
 * Renders one slide through draft (low quality) generation, a
 * reference-preservation check, then final (configured quality)
 * generation and a second check — issue #18 section 6's "draft
 * generation using lower quality, final generation using configured
 * quality after draft passes." Returns a renderSlides()-shaped result
 * plus the updated spend ledger and generation evidence (model, prompt
 * version, dimensions, quality, timestamp, request id, usage) for the
 * asset pipeline (section 5) to record.
 */
export async function renderSlideOpenAiHybrid(slideSpec, providerConfig = {}) {
  const {
    apiKey,
    generateImageFn = generateImage,
    sleepImpl = defaultSleep,
    manifest,
    guideId = manifest && manifest.jobId,
    heroProduct = null,
    referenceImageBase64 = null,
    ledger = [],
    limits = DEFAULT_LIMITS,
    now,
    draftQuality = 'low',
    finalQuality = 'medium',
    model,
    size = '1024x1024',
    visionSignalsBySlide = {},
  } = providerConfig;

  const nowIso = now || new Date().toISOString();
  let workingLedger = ledger;
  const visionSignals = visionSignalsBySlide[slideSpec.order] || null;

  const draftGate = evaluateAttempt({ ledger: workingLedger, guideId, attempt: 1, quality: draftQuality, now: nowIso, limits });
  if (!draftGate.allowed) return blockedResult(draftGate.reason, { ledger: workingLedger, stage: 'draft-budget' });

  const compiled = compileEditorialPrompt({
    manifest,
    heroProduct,
    slideSpec,
    referenceImageSupplied: !!referenceImageBase64,
  });

  const draft = await callWithRetry({
    generateImageFn,
    sleepImpl,
    maxAttempts: limits.maxAttemptsPerSlide,
    apiKey,
    prompt: compiled.editorialPrompt,
    referenceImageBase64,
    size,
    quality: draftQuality,
    model,
    now: nowIso,
  });
  workingLedger = recordSpend(workingLedger, {
    guideId,
    timestampIso: nowIso,
    costUsd: estimateCost(draftQuality),
    accepted: false,
    stage: 'draft',
    slideOrder: slideSpec.order,
  });
  if (draft.result.status !== 'generated') {
    return blockedResult(draft.result.reason, { ledger: workingLedger, stage: 'draft', errorType: draft.result.errorType });
  }

  const draftQa = evaluateSlidePreservation({
    generationResult: draft.result,
    heroProduct,
    referenceImageSupplied: !!referenceImageBase64,
    visionSignals,
  });
  if (draftQa.verdict !== 'accept') {
    // status stays 'blocked' — this is never programmatically accepted —
    // but the composited draft is still attached as `previewContent` (a
    // distinct field from the deterministic renderer's `content`, which is
    // always null when status isn't 'rendered') so a human reviewer has
    // something concrete to judge instead of nothing at all.
    return blockedResult(draftQa.reasons.join('; '), {
      ledger: workingLedger,
      stage: 'draft-visual-qa',
      verdict: draftQa.verdict,
      previewContent: compositeHybridSlideSvg({ slideSpec, imageBase64: draft.result.imageBase64 }),
    });
  }

  const finalGate = evaluateAttempt({ ledger: workingLedger, guideId, attempt: 1, quality: finalQuality, now: nowIso, limits });
  if (!finalGate.allowed) return blockedResult(finalGate.reason, { ledger: workingLedger, stage: 'final-budget' });

  const final = await callWithRetry({
    generateImageFn,
    sleepImpl,
    maxAttempts: limits.maxAttemptsPerSlide,
    apiKey,
    prompt: compiled.editorialPrompt,
    referenceImageBase64,
    size,
    quality: finalQuality,
    model,
    now: nowIso,
  });
  workingLedger = recordSpend(workingLedger, {
    guideId,
    timestampIso: nowIso,
    costUsd: estimateCost(finalQuality),
    accepted: false,
    stage: 'final',
    slideOrder: slideSpec.order,
  });
  if (final.result.status !== 'generated') {
    return blockedResult(final.result.reason, { ledger: workingLedger, stage: 'final', errorType: final.result.errorType });
  }

  const finalQa = evaluateSlidePreservation({
    generationResult: final.result,
    heroProduct,
    referenceImageSupplied: !!referenceImageBase64,
    visionSignals,
  });
  if (finalQa.verdict !== 'accept') {
    return blockedResult(finalQa.reasons.join('; '), {
      ledger: workingLedger,
      stage: 'final-visual-qa',
      verdict: finalQa.verdict,
      previewContent: compositeHybridSlideSvg({ slideSpec, imageBase64: final.result.imageBase64 }),
    });
  }

  workingLedger = recordSpend(workingLedger, {
    guideId,
    timestampIso: nowIso,
    costUsd: 0,
    accepted: true,
    stage: 'accepted',
    slideOrder: slideSpec.order,
    heroProductId: manifest && manifest.heroProductId,
  });

  return {
    mode: RENDERER_MODE,
    format: 'svg',
    status: 'rendered',
    content: compositeHybridSlideSvg({ slideSpec, imageBase64: final.result.imageBase64 }),
    ledger: workingLedger,
    evidence: {
      promptVersion: compiled.version,
      model: final.result.model,
      size: final.result.size,
      quality: final.result.quality,
      generatedAtIso: final.result.timestampIso,
      requestId: final.result.requestId,
      usage: final.result.usage,
      draftAttempts: draft.attempts,
      finalAttempts: final.attempts,
    },
  };
}

/**
 * Renders every slide in `slideSpecs` through the hybrid pipeline,
 * threading the spend ledger from one slide to the next so per-guide and
 * monthly caps are enforced across the whole guide, not per slide in
 * isolation. Stops issuing new generations (falls back to `blocked`) the
 * moment a cap is hit or the accepted-image ceiling is reached — never
 * silently keeps spending past a limit.
 */
export async function renderSlidesOpenAiHybrid(slideSpecs, providerConfig = {}) {
  let ledger = providerConfig.ledger || [];
  const results = [];
  for (const spec of slideSpecs || []) {
    const rendered = await renderSlideOpenAiHybrid(spec, { ...providerConfig, ledger });
    ledger = rendered.ledger || ledger;
    results.push({ slideOrder: spec.order, ...rendered });
  }
  return results;
}
