import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runGuideFactoryJob } from '../guide-factory.mjs';
import { planGuideAssetWrites, writeGuideAssetPlan } from '../guide-production-assets.mjs';
import { scanStaticSite } from '../qa-static-site.mjs';
import {
  COMPLETE_APPROVED_MANIFEST,
  FIXTURE_EXISTING_GUIDES,
  FIXTURE_PRODUCT_IDS,
  MISSING_ASSET_MANIFEST,
  NOW,
} from '../__fixtures__/guide-jobs.mjs';

function runJob(manifest = COMPLETE_APPROVED_MANIFEST) {
  return runGuideFactoryJob(manifest, {
    existingProductIds: FIXTURE_PRODUCT_IDS,
    existingGuides: FIXTURE_EXISTING_GUIDES,
    now: NOW,
  });
}

function makeTempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'wearwyzer-guide-assets-'));
}

test('asset plan uses every canonical slide path and derives cover from verified slide one', () => {
  const result = runJob();
  const plan = planGuideAssetWrites(result);
  assert.deepEqual(
    plan.writes.map((entry) => entry.path),
    [...result.guideRecord.slideImages.map((image) => image.src), result.guideRecord.coverImage]
  );
  const firstSlide = plan.writes[0];
  const cover = plan.writes.at(-1);
  assert.equal(cover.kind, 'cover');
  assert.equal(cover.content, firstSlide.content);
  assert.equal(cover.sha256, firstSlide.sha256);
});

test('complete fixture persists all slides and cover and repeat run is byte-identical', () => {
  const root = makeTempRoot();
  const plan = planGuideAssetWrites(runJob());
  const first = writeGuideAssetPlan(root, plan);
  assert.equal(first.written.length, COMPLETE_APPROVED_MANIFEST.slides.length + 1);
  assert.equal(first.skipped.length, 0);
  const before = new Map(first.allPaths.map((relativePath) => [relativePath, readFileSync(path.join(root, relativePath), 'utf8')]));

  const second = writeGuideAssetPlan(root, plan);
  assert.equal(second.written.length, 0);
  assert.equal(second.skipped.length, first.allPaths.length);
  for (const relativePath of second.allPaths) {
    assert.equal(readFileSync(path.join(root, relativePath), 'utf8'), before.get(relativePath));
  }
});

test('conflicting existing asset fails before any missing asset is partially written', () => {
  const root = makeTempRoot();
  const plan = planGuideAssetWrites(runJob());
  const conflict = plan.writes[1];
  mkdirSync(path.dirname(path.join(root, conflict.path)), { recursive: true });
  writeFileSync(path.join(root, conflict.path), '<svg>different</svg>', 'utf8');

  assert.throws(() => writeGuideAssetPlan(root, plan), /needs human review/);
  assert.throws(() => readFileSync(path.join(root, plan.writes[0].path), 'utf8'), /ENOENT/);
});

test('blocked or incomplete renderer output cannot produce an asset plan', () => {
  const blocked = runJob(MISSING_ASSET_MANIFEST);
  assert.equal(blocked.outcome, 'needs-human');
  assert.throws(() => planGuideAssetWrites(blocked), /must be ready-for-pr/);

  const complete = runJob();
  complete.renderedAssets[1] = { ...complete.renderedAssets[1], content: null };
  assert.throws(() => planGuideAssetWrites(complete), /not a complete rendered SVG/);
});

test('isolated generated guide fixture passes static asset QA', () => {
  const root = makeTempRoot();
  const result = runJob();
  const plan = planGuideAssetWrites(result);
  writeGuideAssetPlan(root, plan);
  const refs = [...result.guideRecord.slideImages.map((image) => image.src), result.guideRecord.coverImage]
    .map((src) => `<img src="${src}" alt="fixture">`)
    .join('\n');
  writeFileSync(path.join(root, 'fixture.dc.html'), `<!doctype html><html><body>${refs}</body></html>`, 'utf8');

  const qa = scanStaticSite(root);
  assert.equal(qa.passed, true, qa.errors.join('\n'));
  assert.equal(qa.checked, plan.writes.length);
});
