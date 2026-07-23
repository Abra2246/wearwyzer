// Fail-closed persistence for Guide Factory slide assets. The factory and
// renderer remain pure; this module validates the renderer result against the
// canonical guide record, plans exact repository paths, and performs the only
// asset writes used by the production CLI.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const GUIDE_ASSET_PREFIX = 'assets/images/guides/';

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function assertSafeGuideAssetPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.startsWith(GUIDE_ASSET_PREFIX)) {
    throw new Error(`guide-production-assets: unsafe asset path "${relativePath}"`);
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized !== relativePath || normalized.includes('..') || path.posix.isAbsolute(normalized)) {
    throw new Error(`guide-production-assets: unsafe asset path "${relativePath}"`);
  }
}

export function planGuideAssetWrites(factoryResult) {
  if (!factoryResult || factoryResult.outcome !== 'ready-for-pr') {
    throw new Error('guide-production-assets: factory result must be ready-for-pr');
  }

  const { guideRecord, renderedAssets } = factoryResult;
  if (!guideRecord || !Array.isArray(guideRecord.slideImages) || guideRecord.slideImages.length === 0) {
    throw new Error('guide-production-assets: guide record has no slide image paths');
  }
  if (!Array.isArray(renderedAssets) || renderedAssets.length !== guideRecord.slideImages.length) {
    throw new Error('guide-production-assets: rendered asset count does not match slide image count');
  }

  const assetsByOrder = new Map();
  for (const asset of renderedAssets) {
    const order = asset?.slideOrder ?? asset?.order;
    if (!asset || asset.status !== 'rendered' || asset.format !== 'svg' || typeof asset.content !== 'string' || asset.content.length === 0) {
      throw new Error(`guide-production-assets: slide ${order ?? 'unknown'} is not a complete rendered SVG`);
    }
    if (!Number.isInteger(order) || order < 1) {
      throw new Error('guide-production-assets: rendered slide is missing a valid order');
    }
    if (assetsByOrder.has(order)) {
      throw new Error(`guide-production-assets: duplicate rendered slide order ${order}`);
    }
    assetsByOrder.set(order, asset);
  }

  const writes = guideRecord.slideImages.map((slideImage, index) => {
    const order = index + 1;
    const asset = assetsByOrder.get(order);
    if (!asset) throw new Error(`guide-production-assets: missing rendered slide ${order}`);
    assertSafeGuideAssetPath(slideImage.src);
    return {
      kind: 'slide',
      order,
      path: slideImage.src,
      content: asset.content,
      sha256: sha256(asset.content),
    };
  });

  assertSafeGuideAssetPath(guideRecord.coverImage);
  const coverSource = writes[0];
  writes.push({
    kind: 'cover',
    order: coverSource.order,
    path: guideRecord.coverImage,
    content: coverSource.content,
    sha256: coverSource.sha256,
  });

  const duplicatePaths = writes.filter((entry, index) => writes.findIndex((candidate) => candidate.path === entry.path) !== index);
  if (duplicatePaths.length) {
    throw new Error(`guide-production-assets: duplicate target path "${duplicatePaths[0].path}"`);
  }

  return { guideId: guideRecord.id, writes };
}

export function writeGuideAssetPlan(root, plan) {
  if (!root || !plan || !Array.isArray(plan.writes)) {
    throw new Error('guide-production-assets: invalid write plan');
  }

  const rootPath = path.resolve(root);
  const decisions = plan.writes.map((entry) => {
    assertSafeGuideAssetPath(entry.path);
    const absolutePath = path.resolve(rootPath, ...entry.path.split('/'));
    if (!absolutePath.startsWith(`${rootPath}${path.sep}`)) {
      throw new Error(`guide-production-assets: target escapes repository root: "${entry.path}"`);
    }
    if (!existsSync(absolutePath)) return { ...entry, absolutePath, action: 'write' };
    const existing = readFileSync(absolutePath, 'utf8');
    if (sha256(existing) !== entry.sha256 || existing !== entry.content) {
      throw new Error(`guide-production-assets: existing asset differs and needs human review: "${entry.path}"`);
    }
    return { ...entry, absolutePath, action: 'skip' };
  });

  for (const decision of decisions.filter((entry) => entry.action === 'write')) {
    mkdirSync(path.dirname(decision.absolutePath), { recursive: true });
    writeFileSync(decision.absolutePath, decision.content, 'utf8');
  }

  return {
    guideId: plan.guideId,
    written: decisions.filter((entry) => entry.action === 'write').map((entry) => entry.path),
    skipped: decisions.filter((entry) => entry.action === 'skip').map((entry) => entry.path),
    allPaths: decisions.map((entry) => entry.path),
  };
}
