#!/usr/bin/env node
// Guide production writer CLI (issue #46). The Guide Factory dispatcher's
// missing last mile: scripts/guide-factory-cli.mjs validates an approved
// manifest and prints a `ready-for-pr` result as evidence, but — by
// deliberate prior design (docs/AUTONOMOUS_GUIDE_FACTORY_V1.md "Why the
// CLI doesn't write site files yet") — never writes it to the live site.
// This CLI is that write step, wired into the same dispatch flow: run it
// wherever scripts/guide-factory-cli.mjs already runs (the staged
// docs/automation/workflows/guide-factory-dispatch.yml calls this file
// instead) and the next approved manifest goes from job file to a
// reviewable branch diff with no manual file-by-file editing.
//
// This CLI is the only file in this feature that touches disk. Every
// transform lives in scripts/guide-production-writer.mjs (pure) and
// scripts/hero-candidate-assessor.mjs (pure) — same pure-logic/thin-IO
// split as every other automation script in this repo.
//
// What it does, per run:
//   1. No approved job in the queue -> run a real hero-candidacy
//      assessment against the live Knowledge Graph (js/products.js,
//      js/guides.js) and report precisely why (or that) a pilot guide
//      can proceed, instead of a bare "nothing to do" no-op. This is the
//      issue's "if no existing hero has enough verified facts, stop with
//      one precise needs-human report instead of inventing data."
//   2. An approved job exists but fails validation -> needs-human, same
//      as scripts/guide-factory-cli.mjs (reuses the identical pipeline).
//   3. An approved job reaches ready-for-pr -> idempotently write
//      js/guides.js, js/products.js, the new *.dc.html page, and
//      sitemap.xml; regenerate the link-engine affiliate-coverage report
//      so it covers the new guide's outfits; record every Mission
//      Control lifecycle event (started, blocked/needs-human,
//      ready-for-review, completed).
//
// This script deliberately owns only production-file writes. The active
// Guide Factory workflow validates those files, commits them on a dedicated
// automation branch, and opens a review PR. It never merges automatically.
//
// Usage:
//   node scripts/guide-production-writer-cli.mjs [--dry-run]

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runGuideFactoryJob, selectNextApprovedJob } from './guide-factory.mjs';
import { planGuideProduction } from './guide-production-writer.mjs';
import { planGuideAssetWrites, writeGuideAssetPlan } from './guide-production-assets.mjs';
import { assessHeroCandidates, renderHeroCandidateReport } from './hero-candidate-assessor.mjs';
import { appendEvent } from './record-status-event.mjs';
import { buildStatusEvent } from './status-log.mjs';
import { buildNotification } from './notify-exception.mjs';
import { runOnce as runLinkEngineOnce } from './link-engine-cli.mjs';

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
  return { products, guides };
}

function record(nowIso, kind, type, summary, detail) {
  appendEvent(buildStatusEvent({ timestampIso: nowIso, kind, type, summary, detail }));
}

/** No approved job exists: assess real hero candidacy and report precisely instead of a bare no-op. */
async function runHeroCandidateAssessment({ dryRun, now }) {
  const { products, guides } = await loadGraphSnapshot();
  const assessment = assessHeroCandidates({ products, guides, now });
  const report = renderHeroCandidateReport(assessment);
  console.log(report);

  if (!dryRun) {
    if (assessment.anyEligible) {
      record(now, 'routine', 'routine-success', 'Hero-candidacy assessment found at least one eligible product for a new pilot guide manifest.', report);
    } else {
      const notification = buildNotification({
        type: 'unverifiable-product-facts',
        summary: 'No hero-eligible product can anchor a new pilot guide right now.',
        detail: report,
        nextAction: 'Add a real, verifiable sourceUrl for a candidate product, or wait out an existing hero\'s cooldown window, then author and approve a manifest.',
      });
      console.error(notification.body);
      record(now, 'exception', 'unverifiable-product-facts', notification.title, report);
    }
  }
  return { type: 'hero-candidate-assessment', assessment };
}

async function writeGuideProduction(factoryResult, { dryRun, now }) {
  const guidesPath = path.join(ROOT, 'js', 'guides.js');
  const productsPath = path.join(ROOT, 'js', 'products.js');
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  const pagePath = path.join(ROOT, factoryResult.guideRecord.slug);

  const plan = planGuideProduction({
    guidesSourceText: readFileSync(guidesPath, 'utf8'),
    productsSourceText: readFileSync(productsPath, 'utf8'),
    sitemapSourceText: readFileSync(sitemapPath, 'utf8'),
    factoryResult,
  });
  const assetPlan = planGuideAssetWrites(factoryResult);

  console.log(JSON.stringify({
    guideId: plan.guideId,
    changes: plan.changes,
    anyApplied: plan.anyApplied,
    assetPaths: assetPlan.writes.map((entry) => entry.path),
  }, null, 2));

  if (dryRun) return { ...plan, assetPlan, assetWriteResult: null };

  // Persist every referenced slide and cover before content records can be
  // marked ready for review. The writer preflights the complete asset set and
  // fails closed on missing, blocked, or conflicting output.
  const assetWriteResult = writeGuideAssetPlan(ROOT, assetPlan);

  if (plan.anyApplied) {
    writeFileSync(guidesPath, plan.guidesSourceText, 'utf8');
    writeFileSync(productsPath, plan.productsSourceText, 'utf8');
    writeFileSync(sitemapPath, plan.sitemapSourceText, 'utf8');
  }
  if (!existsSync(pagePath)) {
    writeFileSync(pagePath, plan.pageHtml, 'utf8');
  }

  // Regenerate the affiliate-coverage report so it reflects the new
  // guide's outfits (data/outfits.js re-derives from js/guides.js on
  // every fresh import) — same report Mission Control's linkEngine
  // section already reads.
  await runLinkEngineOnce({ now });

  const summary = plan.alreadyFullyApplied
    ? `Guide "${plan.guideId}" was already fully published; ${assetWriteResult.skipped.length} verified assets were unchanged (idempotent no-op).`
    : `Guide "${plan.guideId}" was written with ${assetWriteResult.allPaths.length} verified assets, site records, sitemap entry, and ${factoryResult.guideRecord.slug}.`;
  record(now, 'routine', 'guide-production-ready-for-review', summary);
  record(now, 'routine', 'guide-production-completed', summary);

  return { ...plan, assetPlan, assetWriteResult };
}

export async function runOnce({ dryRun = false, now } = {}) {
  const nowIso = now || new Date().toISOString();
  const jobFiles = loadJobs();
  const jobs = jobFiles.map((j) => j.manifest);
  const { selected, reason } = selectNextApprovedJob(jobs);

  if (!selected) {
    return runHeroCandidateAssessment({ dryRun, now: nowIso });
  }

  record(nowIso, 'routine', 'guide-production-started', `Guide production writer claimed job "${selected.jobId}".`);

  const { products, guides } = await loadGraphSnapshot();
  const result = runGuideFactoryJob(selected, {
    existingProductIds: new Set(products.map((p) => p.id)),
    existingGuides: guides,
    now: nowIso,
  });

  if (result.outcome !== 'ready-for-pr') {
    console.error(`✗ Job "${selected.jobId}" needs a human: ${result.reasons.join('; ')}`);
    if (!dryRun) {
      const notification = buildNotification({
        type: 'unverifiable-product-facts',
        summary: `Guide job "${selected.jobId}" stopped at stage "${result.stage}" and needs a human.`,
        detail: result.reasons.join('\n'),
        nextAction: 'Review the manifest, resolve the listed reasons, and re-approve the job.',
      });
      record(nowIso, 'exception', 'unverifiable-product-facts', notification.title, result.reasons.join('; '));
      const jobRecord = jobFiles.find((f) => f.manifest.jobId === selected.jobId);
      if (jobRecord) writeFileSync(jobRecord.file, JSON.stringify({ ...selected, status: 'needs-human' }, null, 2) + '\n', 'utf8');
    }
    return { type: 'needs-human', result };
  }

  let plan;
  try {
    plan = await writeGuideProduction(result, { dryRun, now: nowIso });
  } catch (error) {
    if (!dryRun) {
      const detail = error instanceof Error ? error.message : String(error);
      const jobRecord = jobFiles.find((f) => f.manifest.jobId === selected.jobId);
      if (jobRecord) writeFileSync(jobRecord.file, JSON.stringify({ ...selected, status: 'needs-human' }, null, 2) + '\n', 'utf8');
      record(nowIso, 'exception', 'unverifiable-product-facts', `Guide job "${selected.jobId}" could not persist its verified production assets.`, detail);
    }
    throw error;
  }

  if (!dryRun) {
    const jobRecord = jobFiles.find((f) => f.manifest.jobId === selected.jobId);
    if (jobRecord) writeFileSync(jobRecord.file, JSON.stringify({ ...selected, status: 'ready-for-pr' }, null, 2) + '\n', 'utf8');
  }

  return { type: 'ready-for-pr', result, plan };
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
