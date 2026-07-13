import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  slideAssetPath,
  sourceEditorialAssetPath,
  sha256,
  buildAssetManifestEntry,
  writeGuideAssets,
} from '../openai-asset-pipeline.mjs';

test('slideAssetPath matches the existing slide-NN.<ext> convention', () => {
  assert.equal(slideAssetPath('Fx Pilot Guide!', 2, 'svg'), 'assets/images/guides/fx-pilot-guide/slide-02.svg');
});

test('sourceEditorialAssetPath is a distinct path from the composited final asset', () => {
  const final = slideAssetPath('fx-pilot', 2);
  const source = sourceEditorialAssetPath('fx-pilot', 2);
  assert.notEqual(final, source);
  assert.match(source, /\/source\//);
});

test('sha256 is deterministic and content-sensitive', () => {
  assert.equal(sha256('abc'), sha256('abc'));
  assert.notEqual(sha256('abc'), sha256('abd'));
});

test('buildAssetManifestEntry includes a separate source asset only when a source image is supplied', () => {
  const withSource = buildAssetManifestEntry({ guideId: 'fx-pilot', slideOrder: 2, compositedSvg: '<svg/>', sourceImageBase64: 'ZmFrZQ==' });
  assert.ok(withSource.sourceAsset);
  assert.notEqual(withSource.sourceAsset.path, withSource.finalAsset.path);

  const withoutSource = buildAssetManifestEntry({ guideId: 'fx-pilot', slideOrder: 1, compositedSvg: '<svg/>' });
  assert.equal(withoutSource.sourceAsset, null);
});

test('writeGuideAssets writes the final asset and, when present, the source asset to disk', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wearwyzer-asset-pipeline-'));
  const entry = buildAssetManifestEntry({ guideId: 'fx-pilot', slideOrder: 2, compositedSvg: '<svg>final</svg>', sourceImageBase64: 'ZmFrZQ==' });
  const written = writeGuideAssets(root, [entry], {
    compositedByOrder: { 2: '<svg>final</svg>' },
    sourceImageByOrder: { 2: 'ZmFrZQ==' },
  });
  assert.equal(written.length, 2);
  assert.ok(existsSync(path.join(root, entry.finalAsset.path)));
  assert.ok(existsSync(path.join(root, entry.sourceAsset.path)));
  assert.equal(readFileSync(path.join(root, entry.finalAsset.path), 'utf8'), '<svg>final</svg>');
});
