#!/usr/bin/env node
// Verified supporting-item link engine v1 (issue #24) — the only file in
// this feature that touches disk. scripts/link-engine.mjs and its
// collaborators stay pure and unit-tested
// (scripts/__tests__/link-engine*.test.mjs), same pure-logic/thin-IO split
// as scripts/guide-factory.mjs / scripts/guide-factory-cli.mjs.
//
// Reads the real Knowledge Graph (data/outfits.js, data/products.js,
// data/brands.js, data/taxonomies.js) read-only, builds one "intended
// item" per outfit supporting-item reference, and runs it through the
// pipeline against whatever adapters are actually configured.
//
// This repository ships zero live retailer/brand/affiliate-network
// credentials (CLAUDE.md, docs/LINK_ENGINE_V1.md) — every adapter this
// CLI can construct is either the always-blocked http-provider stub
// (scripts/link-engine-adapters.mjs) or nothing at all. Running this CLI
// against real Knowledge Graph data will therefore honestly resolve every
// item to `needs-human` (reason: no-candidate-found) — that is the
// correct, non-fabricated behavior for an environment with no data
// source, not a bug. scripts/simulate-link-engine.mjs is the actual proof
// the pipeline works end to end, against the isolated fixture universe.
//
// This CLI never writes to data/offers.js, js/products.js, or any
// .dc.html page — same "why the CLI doesn't write site files yet"
// reasoning as scripts/guide-factory-cli.mjs. It writes a read-only
// report to automation/status/link-engine-report.json (git-ignored
// runtime state, same as every other file under automation/status/ —
// see that directory's README) for scripts/ops-status-builder.mjs to
// surface on the Mission Control dashboard.
//
// Usage:
//   node scripts/link-engine-cli.mjs [--dry-run]

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runLinkEngineForOutfit } from './link-engine.mjs';
import { computeGuideCoverage, computePortfolioCoverage, logCoverageShortfall, trackShortfallRecurrence } from './link-engine-coverage.mjs';
import { createHttpProviderAdapter, ADAPTER_KINDS } from './link-engine-adapters.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'automation', 'status', 'link-engine-report.json');

/** Every configured-but-inert extension point this repo ships. No live provider is ever constructed here — see module header. */
function buildAdapterRegistry(env = process.env) {
  return ADAPTER_KINDS.map((kind) => createHttpProviderAdapter({ id: `${kind}-provider`, kind, name: `${kind} (unconfigured)`, env }));
}

function buildIntendedItem(outfitItem, productById, brandById) {
  const product = outfitItem.productId ? productById.get(outfitItem.productId) : null;
  const brand = product?.brandId ? brandById.get(product.brandId) : null;
  return {
    outfitItemId: outfitItem._outfitItemId,
    productId: outfitItem.productId,
    label: outfitItem.label,
    brand: brand ? brand.name : null,
    name: product ? product.name : null,
    category: product ? product.categoryId : null,
    color: product ? product.colorway : null,
    material: null, // not modeled in data/products.js today — never guessed
    gender: null, // not modeled in data/products.js today — never guessed
    canonicalId: null, // no canonical identifier source exists in this repo's data yet
    priceTier: null,
  };
}

export async function runOnce({ dryRun = false, now } = {}) {
  const nowIso = now || new Date().toISOString();
  const { outfits } = await import(path.join(ROOT, 'data', 'outfits.js'));
  const { products } = await import(path.join(ROOT, 'data', 'products.js'));
  const { brands } = await import(path.join(ROOT, 'data', 'brands.js'));

  const productById = new Map(products.map((p) => [p.id, p]));
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const adapters = buildAdapterRegistry();

  const perGuideResults = [];

  for (const outfit of outfits) {
    const intendedItems = outfit.items.map((item, i) => ({ ...item, _outfitItemId: `${outfit.id}--${i}` }));
    const wrappedOutfit = {
      outfitId: outfit.id,
      items: intendedItems.map((item) => buildIntendedItem(item, productById, brandById)),
    };
    const runResult = await runLinkEngineForOutfit(wrappedOutfit, adapters, { now: nowIso });
    perGuideResults.push({ guideId: outfit.guideId, outfitId: outfit.id, results: runResult.results, duplicates: runResult.duplicates });
  }

  // Coverage is computed per GUIDE (hero + every supporting item across all
  // of that guide's outfits), not per outfit — a guide with several
  // outfits is one coverage/threshold unit, per the issue's "per-guide...
  // quality gate" language.
  const resultsByGuideId = new Map();
  for (const entry of perGuideResults) {
    if (!resultsByGuideId.has(entry.guideId)) resultsByGuideId.set(entry.guideId, []);
    resultsByGuideId.get(entry.guideId).push(...entry.results);
  }

  const guideCoverages = [];
  const shortfalls = [];
  for (const [guideId, results] of resultsByGuideId) {
    const coverage = computeGuideCoverage(guideId, results);
    guideCoverages.push(coverage);
    const shortfall = logCoverageShortfall(coverage, results, { now: nowIso });
    if (shortfall) shortfalls.push(shortfall);
  }

  const portfolio = computePortfolioCoverage(guideCoverages);
  const recurrence = trackShortfallRecurrence(shortfalls);

  const report = {
    generatedAtIso: nowIso,
    adapterMode: 'inert-no-credentials-configured',
    portfolioCoverage: portfolio,
    guideCoverages,
    shortfallCount: shortfalls.length,
    sourcingPriorityGuides: recurrence.filter((r) => r.isSourcingPriority).map((r) => r.guideId),
    needsHumanCount: perGuideResults.reduce((sum, g) => sum + g.results.filter((r) => r.outcome === 'needs-human').length, 0),
    brokenCount: perGuideResults.reduce(
      (sum, g) => sum + g.results.filter((r) => r.offer && ['dead', 'redirected', 'mismatched', 'unavailable'].includes(r.offer.linkStatus)).length,
      0
    ),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!dryRun) {
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`\nWrote ${REPORT_PATH}`);
  }

  return report;
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
