#!/usr/bin/env node
// Guide factory dispatcher CLI (issue #17, sections 1-2). Dependency-free
// Node ESM, same style as scripts/queue-dispatch.mjs. This is the only
// file in the guide factory that touches the filesystem or the network —
// scripts/guide-factory.mjs and its collaborators stay pure and
// unit-tested (scripts/__tests__/guide-factory.test.mjs).
//
// Reads every job manifest under automation/guide-jobs/*.json, selects
// the single oldest `approved` job (never more than one per run — same
// single-flight rule as the engineering queue), validates it against the
// real Knowledge Graph (data/products.js, js/guides.js), and either:
//   - prints a `ready-for-pr` result (the generated guide record, product
//     records, page HTML, and metadata) for a human/CI step to commit and
//     open a PR from, or
//   - marks the job `needs-human` in place, with the specific reasons,
//     and posts a concise exception notification via the queue GitHub
//     client if GITHUB_TOKEN is available.
//
// This CLI intentionally never writes to js/guides.js, js/products.js,
// or any *.dc.html page itself — see docs/AUTONOMOUS_GUIDE_FACTORY_V1.md
// "Why the CLI doesn't write site files yet" for why that last mile
// stays a reviewed, human-triggered step in this version.
//
// Usage:
//   node scripts/guide-factory-cli.mjs [--dry-run]

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runGuideFactoryJob, selectNextApprovedJob } from './guide-factory.mjs';
import { appendEvent } from './record-status-event.mjs';
import { buildStatusEvent } from './status-log.mjs';
import { buildNotification } from './notify-exception.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JOBS_DIR = path.join(ROOT, 'automation', 'guide-jobs');

function loadJobs() {
  if (!existsSync(JOBS_DIR)) return [];
  return readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: path.join(JOBS_DIR, f), manifest: JSON.parse(readFileSync(path.join(JOBS_DIR, f), 'utf8')) }));
}

async function loadGraphSnapshot() {
  const { products } = await import(path.join(ROOT, 'js', 'products.js'));
  const { guides } = await import(path.join(ROOT, 'js', 'guides.js'));
  return { existingProductIds: new Set(products.map((p) => p.id)), existingGuides: guides };
}

export async function runOnce({ dryRun = false, now } = {}) {
  const jobFiles = loadJobs();
  const jobs = jobFiles.map((j) => j.manifest);
  const { selected, reason } = selectNextApprovedJob(jobs);
  if (!selected) {
    console.log(`No-op: ${reason}`);
    return { type: 'noop', reason };
  }

  const { existingProductIds, existingGuides } = await loadGraphSnapshot();
  const result = runGuideFactoryJob(selected, { existingProductIds, existingGuides, now });
  const nowIso = now || new Date().toISOString();

  if (result.outcome === 'ready-for-pr') {
    console.log(`✓ Job "${selected.jobId}" is ready for a PR.`);
    console.log(JSON.stringify({ guideRecord: result.guideRecord, metadata: result.metadata }, null, 2));
    if (!dryRun) {
      appendEvent(
        buildStatusEvent({
          timestampIso: nowIso,
          kind: 'routine',
          type: 'guide-job-ready-for-pr',
          summary: `Guide job "${selected.jobId}" passed every validator and is ready for a PR.`,
        })
      );
    }
    return { type: 'ready-for-pr', result };
  }

  console.error(`✗ Job "${selected.jobId}" needs a human: ${result.reasons.join('; ')}`);
  const notification = buildNotification({
    type: 'unverifiable-product-facts',
    summary: `Guide job "${selected.jobId}" stopped at stage "${result.stage}" and needs a human.`,
    detail: result.reasons.join('\n'),
    nextAction: 'Review the manifest, resolve the listed reasons, and re-approve the job.',
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
  await runOnce({ dryRun });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
