import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  classifySourceFile,
  runStyleGuideImportJob,
  buildImportDispositionReport,
  findExactCanonicalDuplicate,
  buildDraftManifestFromStructuredSource,
} from '../style-guide-importer.mjs';
import {
  FIXTURE_PRODUCT_IDS,
  FIXTURE_EXISTING_GUIDES,
  NOW,
  COMPLETE_STRUCTURED_SOURCE,
  DUPLICATE_STRUCTURED_SOURCE,
  MISSING_FACTS_STRUCTURED_SOURCE,
  INVALID_JSON_SOURCE,
  FREEFORM_TEXT_SOURCE,
  UNSUPPORTED_BINARY_SOURCE,
  UNKNOWN_FORMAT_SOURCE,
} from '../__fixtures__/style-guide-sources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function run(source) {
  return runStyleGuideImportJob(source, {
    existingProductIds: FIXTURE_PRODUCT_IDS,
    existingGuides: FIXTURE_EXISTING_GUIDES,
    now: NOW,
  });
}

test('classifySourceFile recognizes structured, freeform-text, unsupported-binary, and unknown formats', () => {
  assert.equal(classifySourceFile('a.json').kind, 'structured');
  assert.equal(classifySourceFile('a.md').kind, 'freeform-text');
  assert.equal(classifySourceFile('a.markdown').kind, 'freeform-text');
  assert.equal(classifySourceFile('a.txt').kind, 'freeform-text');
  assert.equal(classifySourceFile('a.pdf').kind, 'unsupported-binary');
  assert.equal(classifySourceFile('a.docx').kind, 'unsupported-binary');
  assert.equal(classifySourceFile('a.xyz').kind, 'unknown');
  assert.equal(classifySourceFile('noextension').kind, 'unknown');
});

test('a complete, verifiable, non-duplicate structured source becomes draft-manifest-ready', () => {
  const result = run(COMPLETE_STRUCTURED_SOURCE);
  assert.equal(result.disposition, 'draft-manifest-ready');
  assert.equal(result.manifest.status, 'draft');
  assert.equal(result.manifest.riskTier, 'medium');
  assert.equal(result.manifest.confidence, 'unverified');
  assert.equal(result.manifest.heroProductId, 'fx-new-hero');
});

test('a draft manifest never claims a fact the source did not provide', () => {
  const draft = buildDraftManifestFromStructuredSource({ heroProductId: 'fx-tee' }, { filePath: 'x.json', now: NOW });
  assert.equal(draft.concept, null);
  assert.equal(draft.hook, null);
  assert.equal(draft.outfits, null);
  assert.equal(draft.slides, null);
  assert.equal(draft.sources[0].verifiedAt, null);
  assert.equal(draft.sources[0].url, 'file:x.json');
});

test('a source matching an existing guide slug is skipped as a duplicate, never re-imported', () => {
  const result = run(DUPLICATE_STRUCTURED_SOURCE);
  assert.equal(result.disposition, 'duplicate-skipped');
  assert.match(result.reasons[0], /fx-existing-guide/);
});

test('findExactCanonicalDuplicate matches by slug or by case-insensitive title', () => {
  const bySlug = { website: { slugHint: 'fx-existing', title: 'Something else entirely' } };
  const byTitle = { website: { slugHint: 'unrelated-slug', title: 'HOW TO STYLE THE FIXTURE TRAIL JACKET' } };
  const neither = { website: { slugHint: 'brand-new', title: 'A totally new guide' } };
  assert.ok(findExactCanonicalDuplicate(bySlug, FIXTURE_EXISTING_GUIDES));
  assert.ok(findExactCanonicalDuplicate(byTitle, FIXTURE_EXISTING_GUIDES));
  assert.equal(findExactCanonicalDuplicate(neither, FIXTURE_EXISTING_GUIDES), null);
});

test('a structured source missing required facts is isolated as needs-human, never guessed', () => {
  const result = run(MISSING_FACTS_STRUCTURED_SOURCE);
  assert.equal(result.disposition, 'needs-human');
  assert.ok(result.reasons.length > 0);
});

test('invalid JSON is isolated as needs-human with a parse error, not silently skipped', () => {
  const result = run(INVALID_JSON_SOURCE);
  assert.equal(result.disposition, 'needs-human');
  assert.match(result.reasons[0], /invalid JSON/);
});

test('a freeform text source is never auto-extracted — always needs-human', () => {
  const result = run(FREEFORM_TEXT_SOURCE);
  assert.equal(result.disposition, 'needs-human');
  assert.match(result.reasons[0], /freeform text/);
});

test('an unsupported binary format is flagged, not silently dropped', () => {
  const result = run(UNSUPPORTED_BINARY_SOURCE);
  assert.equal(result.disposition, 'needs-human');
  assert.match(result.reasons[0], /unsupported binary/);
});

test('an unrecognized extension is flagged, not silently dropped', () => {
  const result = run(UNKNOWN_FORMAT_SOURCE);
  assert.equal(result.disposition, 'needs-human');
  assert.match(result.reasons[0], /unrecognized file format/);
});

test('buildImportDispositionReport aggregates counts by format and disposition', () => {
  const results = [run(COMPLETE_STRUCTURED_SOURCE), run(DUPLICATE_STRUCTURED_SOURCE), run(FREEFORM_TEXT_SOURCE)];
  const report = buildImportDispositionReport(true, results, { scannedAt: NOW });
  assert.equal(report.sourceCount, 3);
  assert.equal(report.dispositionCounts['draft-manifest-ready'], 1);
  assert.equal(report.dispositionCounts['duplicate-skipped'], 1);
  assert.equal(report.dispositionCounts['needs-human'], 1);
  assert.equal(report.formatCounts['.json'], 2);
  assert.equal(report.formatCounts['.md'], 1);
});

test('an absent source directory reports zero sources, not an error', () => {
  const report = buildImportDispositionReport(false, [], { scannedAt: NOW });
  assert.equal(report.sourceDirectoryExists, false);
  assert.equal(report.sourceCount, 0);
  assert.deepEqual(report.formatCounts, {});
  assert.deepEqual(report.dispositionCounts, {});
});

test('REGRESSION: the real "Style Guides" folder does not exist in this repository as of this change — the inventory finding this importer was built against', () => {
  assert.equal(existsSync(path.join(ROOT, 'Style Guides')), false);
});
