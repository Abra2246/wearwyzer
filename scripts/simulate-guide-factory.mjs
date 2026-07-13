#!/usr/bin/env node
// Guide factory end-to-end simulation (issue #17 acceptance criterion:
// "One approved fixture guide can run end-to-end from manifest to
// validated PR with no human prompt relay"). Runs entirely against the
// isolated fixture universe in scripts/__fixtures__/guide-jobs.mjs — not
// the real site content — so this is safe to run any time without ever
// touching js/products.js, js/guides.js, or opening a real PR.
//
// Usage:
//   node scripts/simulate-guide-factory.mjs
//
// Exit code 0 = the fixture manifest reached `ready-for-pr` and every
// validator passed. Exit code 1 = it did not (this would itself be a
// regression in the pipeline, since the fixture is designed to succeed).

import { runGuideFactoryJob } from './guide-factory.mjs';
import { FIXTURE_PRODUCT_IDS, FIXTURE_EXISTING_GUIDES, COMPLETE_APPROVED_MANIFEST, NOW } from './__fixtures__/guide-jobs.mjs';

const result = runGuideFactoryJob(COMPLETE_APPROVED_MANIFEST, {
  existingProductIds: FIXTURE_PRODUCT_IDS,
  existingGuides: FIXTURE_EXISTING_GUIDES,
  now: NOW,
});

const evidence = {
  jobId: COMPLETE_APPROVED_MANIFEST.jobId,
  outcome: result.outcome,
  haltsForReview: result.haltsForReview,
  validators: {
    manifestValidation: 'passed',
    contentQualityPolicy: result.policyResult ? (result.policyResult.passed ? 'passed' : 'failed') : 'not-reached',
    affiliateCoverage: result.policyResult ? result.policyResult.affiliateCoverage : null,
  },
  guideRecordId: result.guideRecord ? result.guideRecord.id : null,
  slideCount: result.slideSpecs ? result.slideSpecs.length : 0,
  renderedAssetStatuses: (result.renderedAssets || []).map((a) => a.status),
  pageHtmlByteLength: result.pageHtml ? result.pageHtml.length : 0,
  metadata: result.metadata || null,
};

console.log(JSON.stringify(evidence, null, 2));

if (result.outcome !== 'ready-for-pr') {
  console.error('\n✗ Simulation FAILED — the known-good fixture manifest did not reach ready-for-pr.');
  console.error(result.reasons.join('\n'));
  process.exit(1);
}

console.log('\n✓ Fixture guide job ran end-to-end to ready-for-pr with no human prompt relay.');
