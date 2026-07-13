#!/usr/bin/env node
// End-to-end simulation of the style guide importer (issue #34),
// mirroring scripts/simulate-guide-factory.mjs's pattern. Proves the full
// pipeline — classify, exact-duplicate check, manifest-validate, draft —
// against an isolated fixture source, then pipes the resulting draft
// manifest through the real scripts/guide-factory.mjs pipeline (after
// simulating the human "draft -> approved" promotion that
// automation/guide-jobs/README.md's lifecycle always requires) to prove
// the importer's output composes end-to-end with the existing guide
// factory. Never touches real site content or a real "Style Guides"
// folder.
//
// Usage:
//   node scripts/simulate-style-guide-import.mjs
//
// Exit code 0 = the fixture source reached draft-manifest-ready and, once
// promoted, the guide factory reached ready-for-pr. Exit code 1 = either
// step regressed.

import { runStyleGuideImportJob } from './style-guide-importer.mjs';
import { runGuideFactoryJob } from './guide-factory.mjs';
import { FIXTURE_PRODUCT_IDS, FIXTURE_EXISTING_GUIDES, NOW, COMPLETE_STRUCTURED_SOURCE } from './__fixtures__/style-guide-sources.mjs';

const importResult = runStyleGuideImportJob(COMPLETE_STRUCTURED_SOURCE, {
  existingProductIds: FIXTURE_PRODUCT_IDS,
  existingGuides: FIXTURE_EXISTING_GUIDES,
  now: NOW,
});

console.log(
  JSON.stringify(
    { stage: 'import', disposition: importResult.disposition, jobId: importResult.jobId, reasons: importResult.reasons },
    null,
    2
  )
);

if (importResult.disposition !== 'draft-manifest-ready') {
  console.error('\n✗ Simulation FAILED — the known-good fixture source did not reach draft-manifest-ready.');
  process.exit(1);
}

// A real promotion from "draft" to "approved" is always a human action
// (automation/guide-jobs/README.md's lifecycle) — simulated here only to
// prove the downstream guide factory composes with this importer's
// output shape.
const approvedManifest = { ...importResult.manifest, status: 'approved' };

const factoryResult = runGuideFactoryJob(approvedManifest, {
  existingProductIds: FIXTURE_PRODUCT_IDS,
  existingGuides: FIXTURE_EXISTING_GUIDES,
  now: NOW,
});

console.log(JSON.stringify({ stage: 'guide-factory', outcome: factoryResult.outcome, stagePath: factoryResult.stage }, null, 2));

if (factoryResult.outcome !== 'ready-for-pr') {
  console.error('\n✗ Simulation FAILED — the imported manifest did not reach ready-for-pr through the guide factory.');
  console.error((factoryResult.reasons || []).join('\n'));
  process.exit(1);
}

console.log('\n✓ Style guide import → draft manifest → (simulated human approval) → guide factory ready-for-pr, end-to-end, with no fabricated facts.');
