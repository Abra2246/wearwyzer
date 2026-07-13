#!/usr/bin/env node
// Style Guides folder importer CLI (issue #34). Dependency-free Node ESM,
// same split as scripts/guide-factory-cli.mjs: this file is the only one
// that touches the filesystem; scripts/style-guide-importer.mjs stays
// pure and unit-tested.
//
// Scans SOURCE_DIR (default: "<repo root>/Style Guides") for guide source
// documents, runs each through the importer pipeline against the real
// site data (js/guides.js, js/products.js), and writes:
//   - a draft manifest (status: "draft", NEVER "approved") to
//     automation/guide-jobs/<jobId>.json for every structurally valid,
//     non-duplicate source — a human must verify real sources/prices and
//     promote it to "approved" before scripts/guide-factory-cli.mjs will
//     ever pick it up (see automation/guide-jobs/README.md's lifecycle).
//   - a provenance/disposition report (JSON) to
//     automation/status/style-guide-import-report.json, plus a printed
//     summary.
//
// This CLI never writes to js/guides.js, js/products.js, data/*.js, or
// any *.dc.html page directly, never calls the guide factory or any
// renderer, and never touches or regenerates any existing carousel asset
// under assets/images/guides/ — see docs/STYLE_GUIDE_IMPORTER_V1.md.
//
// Usage:
//   node scripts/style-guide-importer-cli.mjs [--source-dir <path>] [--dry-run]

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runStyleGuideImportJob, buildImportDispositionReport } from './style-guide-importer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE_DIR = path.join(ROOT, 'Style Guides');
const JOBS_DIR = path.join(ROOT, 'automation', 'guide-jobs');
const REPORT_PATH = path.join(ROOT, 'automation', 'status', 'style-guide-import-report.json');

function listSourceFiles(dir) {
  if (!existsSync(dir)) return { exists: false, files: [] };
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const full = path.join(dir, e.name);
      return { path: full, content: readFileSync(full, 'utf8') };
    });
  return { exists: true, files };
}

async function loadSiteDataSnapshot() {
  const { products } = await import(path.join(ROOT, 'js', 'products.js'));
  const { guides } = await import(path.join(ROOT, 'js', 'guides.js'));
  return { existingProductIds: new Set(products.map((p) => p.id)), existingGuides: guides };
}

export async function runOnce({ sourceDir = DEFAULT_SOURCE_DIR, dryRun = false, now } = {}) {
  const { exists, files } = listSourceFiles(sourceDir);
  const { existingProductIds, existingGuides } = await loadSiteDataSnapshot();

  const results = files.map((f) => runStyleGuideImportJob(f, { existingProductIds, existingGuides, now }));
  const report = buildImportDispositionReport(exists, results, { scannedAt: now });

  if (!dryRun) {
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');

    for (const r of results) {
      if (r.disposition === 'draft-manifest-ready' && r.manifest) {
        mkdirSync(JOBS_DIR, { recursive: true });
        writeFileSync(path.join(JOBS_DIR, `${r.manifest.jobId}.json`), JSON.stringify(r.manifest, null, 2) + '\n', 'utf8');
      }
    }
  }

  return report;
}

function printSummary(report) {
  console.log(`Style Guides source directory exists: ${report.sourceDirectoryExists}`);
  console.log(`Sources found: ${report.sourceCount}`);
  console.log(`Formats: ${JSON.stringify(report.formatCounts)}`);
  console.log(`Dispositions: ${JSON.stringify(report.dispositionCounts)}`);
  for (const r of report.results) {
    console.log(`  - ${r.sourcePath}: ${r.disposition}${r.reasons ? ` (${r.reasons.join('; ')})` : ''}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sourceDirIdx = args.indexOf('--source-dir');
  const sourceDir = sourceDirIdx !== -1 ? path.resolve(args[sourceDirIdx + 1]) : DEFAULT_SOURCE_DIR;
  const report = await runOnce({ sourceDir, dryRun });
  printSummary(report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
