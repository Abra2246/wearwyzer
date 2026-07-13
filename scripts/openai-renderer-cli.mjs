#!/usr/bin/env node
// OpenAI image renderer dispatcher CLI (issue #18). Dependency-free Node
// ESM, same style as scripts/guide-factory-cli.mjs — this is the only
// file in the OpenAI renderer that touches the filesystem, the network,
// or the environment; every collaborator it calls
// (scripts/openai-hybrid-renderer.mjs and everything under it) stays
// pure/injectable and unit-tested (scripts/__tests__/openai-*.test.mjs).
//
// Reads OPENAI_API_KEY from the environment ONLY (readApiKeyFromEnv) —
// never from argv, an issue body, a file, or any other channel — and
// never logs it. Fails closed (marks the job needs-human, never guesses)
// when the key is absent, and always runs in --simulate mode when no key
// is present so CI/tests can exercise this CLI with zero real spend.
//
// Selects the single oldest `approved` job from automation/guide-jobs/
// whose manifest requests OpenAI-hybrid rendering
// (assets.rendererMode === 'openai-hybrid'); every other job is left for
// scripts/guide-factory-cli.mjs's synchronous deterministic-template path
// exactly as before — this CLI does not change that file's behavior.
//
// Usage:
//   node scripts/openai-renderer-cli.mjs [--dry-run] [--simulate]

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runGuideFactoryJob, selectNextApprovedJob, generateSlideSpecs } from './guide-factory.mjs';
import { renderSlideDeterministic } from './guide-renderer-adapter.mjs';
import { renderSlidesOpenAiHybrid } from './openai-hybrid-renderer.mjs';
import { generateImage, readApiKeyFromEnv } from './openai-image-provider.mjs';
import { DEFAULT_LIMITS } from './openai-cost-controls.mjs';
import { readLedger, appendLedgerEntries } from './openai-spend-ledger.mjs';
import { appendEvent } from './record-status-event.mjs';
import { buildStatusEvent } from './status-log.mjs';
import { buildNotification } from './notify-exception.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JOBS_DIR = path.join(ROOT, 'automation', 'guide-jobs');

// A tiny, valid 1x1 transparent PNG, base64-encoded — used only in
// --simulate mode (or automatically when OPENAI_API_KEY is absent and
// --simulate was explicitly requested) so this path can never make a real
// network call regardless of what's passed for `apiKey`.
const SIMULATED_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function simulatedGenerateImageFn({ size, quality, now }) {
  return {
    status: 'generated',
    errorType: null,
    imageBase64: SIMULATED_IMAGE_BASE64,
    revisedPrompt: 'simulated generation — no real API call was made',
    model: 'gpt-image-2-simulated',
    size,
    quality,
    requestId: null,
    usage: null,
    timestampIso: now,
  };
}

function loadOpenAiHybridJobs() {
  if (!existsSync(JOBS_DIR)) return [];
  return readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: path.join(JOBS_DIR, f), manifest: JSON.parse(readFileSync(path.join(JOBS_DIR, f), 'utf8')) }))
    .filter((j) => j.manifest.assets && j.manifest.assets.rendererMode === 'openai-hybrid');
}

async function loadGraphSnapshot() {
  const { products } = await import(path.join(ROOT, 'js', 'products.js'));
  const { guides } = await import(path.join(ROOT, 'js', 'guides.js'));
  return { existingProductIds: new Set(products.map((p) => p.id)), existingGuides: guides };
}

/** Slide 1 and the last slide are the cover/summary — always deterministic-template; every slide in between is editorial imagery for the hybrid renderer (issue #18 approved pilot defaults). */
function splitSlidesByRenderer(slideSpecs) {
  const maxOrder = Math.max(...slideSpecs.map((s) => s.order));
  const deterministic = slideSpecs.filter((s) => s.order === 1 || s.order === maxOrder);
  const hybrid = slideSpecs.filter((s) => s.order !== 1 && s.order !== maxOrder);
  return { deterministic, hybrid };
}

export async function runOnce({ dryRun = false, simulate = false, now, fetchImpl } = {}) {
  const jobFiles = loadOpenAiHybridJobs();
  const jobs = jobFiles.map((j) => j.manifest);
  const { selected, reason } = selectNextApprovedJob(jobs);
  if (!selected) {
    console.log(`No-op: ${reason}`);
    return { type: 'noop', reason };
  }

  const apiKey = readApiKeyFromEnv(process.env);
  const effectiveSimulate = simulate || !apiKey;
  if (!apiKey && !simulate) {
    console.error(`✗ Job "${selected.jobId}" needs a human: OPENAI_API_KEY is not set.`);
    const notification = buildNotification({
      type: 'missing-or-expired-credential',
      summary: `OpenAI renderer job "${selected.jobId}" cannot run: OPENAI_API_KEY is not set.`,
      nextAction: 'Confirm the repository secret is configured, or run with --simulate for a no-key dry run.',
    });
    if (!dryRun) {
      appendEvent(
        buildStatusEvent({
          timestampIso: now || new Date().toISOString(),
          kind: 'exception',
          type: 'missing-or-expired-credential',
          summary: notification.title,
        })
      );
    }
    return { type: 'needs-human', reason: 'missing-or-expired-credential' };
  }

  const { existingProductIds, existingGuides } = await loadGraphSnapshot();
  const slideSpecs = generateSlideSpecs(selected);
  const { deterministic, hybrid } = splitSlidesByRenderer(slideSpecs);

  const deterministicResults = deterministic.map((spec) => ({ slideOrder: spec.order, ...renderSlideDeterministic(spec) }));

  const ledger = readLedger();
  const nowIso = now || new Date().toISOString();
  // Never let --simulate (or the automatic no-key fallback) reach the real
  // provider: a simulated apiKey passed into the real generateImage would
  // still attempt an actual network call, which is exactly what
  // simulate mode must not do.
  const generateImageFn = effectiveSimulate
    ? simulatedGenerateImageFn
    : fetchImpl
      ? (args) => generateImage({ ...args, fetchImpl })
      : generateImage;
  const hybridResults = await renderSlidesOpenAiHybrid(hybrid, {
    apiKey: effectiveSimulate ? 'sk-simulated-not-a-real-key' : apiKey,
    generateImageFn,
    manifest: selected,
    ledger,
    limits: DEFAULT_LIMITS,
    now: nowIso,
  });

  const newLedgerEntries = hybridResults.length ? (hybridResults[hybridResults.length - 1].ledger || []).slice(ledger.length) : [];
  if (!dryRun) appendLedgerEntries(newLedgerEntries);

  const renderedAssets = [...deterministicResults, ...hybridResults].sort((a, b) => a.slideOrder - b.slideOrder);

  const result = runGuideFactoryJob(selected, {
    existingProductIds,
    existingGuides,
    now: nowIso,
    precomputedRenderedAssets: renderedAssets,
  });

  if (result.outcome === 'ready-for-pr') {
    console.log(`✓ Job "${selected.jobId}" is ready for a PR (OpenAI-hybrid rendering, simulate=${effectiveSimulate}).`);
    console.log(JSON.stringify({ guideRecord: result.guideRecord, metadata: result.metadata }, null, 2));
    return { type: 'ready-for-pr', result };
  }

  console.error(`✗ Job "${selected.jobId}" needs a human: ${result.reasons.join('; ')}`);
  const notification = buildNotification({
    type: 'unverifiable-product-facts',
    summary: `OpenAI-hybrid guide job "${selected.jobId}" stopped at stage "${result.stage}" and needs a human.`,
    detail: result.reasons.join('\n'),
    nextAction: 'Review the generated/composited slide evidence and the specific reasons, then re-approve or reject.',
  });
  console.error(notification.body);
  if (!dryRun) {
    appendEvent(
      buildStatusEvent({
        timestampIso: nowIso,
        kind: 'exception',
        type: 'unverifiable-product-facts',
        summary: notification.title,
        detail: result.reasons.join('; '),
      })
    );
    const jobRecord = jobFiles.find((f) => f.manifest.jobId === selected.jobId);
    if (jobRecord) writeFileSync(jobRecord.file, JSON.stringify({ ...selected, status: 'needs-human' }, null, 2) + '\n', 'utf8');
  }
  return { type: 'needs-human', result };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const simulate = process.argv.includes('--simulate');
  await runOnce({ dryRun, simulate });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
