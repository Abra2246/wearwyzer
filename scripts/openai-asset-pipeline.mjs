// Asset pipeline for the OpenAI image renderer (issue #18, section 5).
// Pure naming/checksum functions — the only fs-writing function
// (`writeGuideAssets`) is a thin I/O layer at the bottom, same pure/IO
// split as scripts/guide-factory.mjs vs scripts/guide-factory-cli.mjs.
//
// Canonical spec: docs/OPENAI_IMAGE_RENDERER_V1.md

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function slugifyId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Matches the "slide-NN.<ext>" convention scripts/content-quality-policy.mjs already enforces. */
export function slideAssetPath(guideId, order, ext = 'svg') {
  return `assets/images/guides/${slugifyId(guideId)}/slide-${String(order).padStart(2, '0')}.${ext}`;
}

/** Source editorial images live in a separate subpath from composited final slides (issue #18 section 5). */
export function sourceEditorialAssetPath(guideId, order, ext = 'png') {
  return `assets/images/guides/${slugifyId(guideId)}/source/slide-${String(order).padStart(2, '0')}-source.${ext}`;
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Builds the manifest entry the asset pipeline records for one rendered
 * slide: the final composited asset's path + checksum, and — only when a
 * source editorial image exists (openai-hybrid slides) — its own separate
 * path + checksum. Checksums exist so an accidental re-render can never
 * silently replace an asset without the change being visible (issue #18
 * section 5's explicit requirement).
 */
export function buildAssetManifestEntry({ guideId, slideOrder, compositedSvg, sourceImageBase64 = null }) {
  const entry = {
    slideOrder,
    finalAsset: { path: slideAssetPath(guideId, slideOrder, 'svg'), checksumSha256: sha256(compositedSvg) },
    sourceAsset: null,
  };
  if (sourceImageBase64) {
    const sourceBuffer = Buffer.from(sourceImageBase64, 'base64');
    entry.sourceAsset = {
      path: sourceEditorialAssetPath(guideId, slideOrder, 'png'),
      checksumSha256: sha256(sourceBuffer),
    };
  }
  return entry;
}

/**
 * The only function in this module that touches the filesystem. Writes
 * every entry's final (and, where present, source) asset under `root`,
 * creating directories as needed.
 */
export function writeGuideAssets(root, entries, { compositedByOrder = {}, sourceImageByOrder = {} } = {}) {
  const written = [];
  for (const entry of entries || []) {
    const finalAbsPath = path.join(root, entry.finalAsset.path);
    mkdirSync(path.dirname(finalAbsPath), { recursive: true });
    writeFileSync(finalAbsPath, compositedByOrder[entry.slideOrder], 'utf8');
    written.push(entry.finalAsset.path);

    if (entry.sourceAsset && sourceImageByOrder[entry.slideOrder]) {
      const sourceAbsPath = path.join(root, entry.sourceAsset.path);
      mkdirSync(path.dirname(sourceAbsPath), { recursive: true });
      writeFileSync(sourceAbsPath, Buffer.from(sourceImageByOrder[entry.slideOrder], 'base64'));
      written.push(entry.sourceAsset.path);
    }
  }
  return written;
}
