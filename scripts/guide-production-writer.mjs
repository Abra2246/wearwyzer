// Production writer for the autonomous Guide Factory (issue #46). Pure,
// dependency-free text/data transforms — no filesystem or network access in
// this file. scripts/guide-production-writer-cli.mjs is the only file that
// reads/writes js/guides.js, js/products.js, sitemap.xml, or any *.dc.html
// page, matching the pure-logic/thin-IO split every other automation
// script in this repo already follows (scripts/guide-factory.mjs,
// scripts/link-engine.mjs).
//
// Canonical spec: docs/PRODUCTION_WRITER_V1.md
//
// This module takes a `ready-for-pr` result from
// scripts/guide-factory.mjs's runGuideFactoryJob() and turns it into the
// exact, minimal source-text edits needed to publish it against the
// *current* static site architecture (js/guides.js, js/products.js,
// sitemap.xml, one new *.dc.html page) — reusing the existing guide
// template and canonical Knowledge Graph, never inventing a parallel
// content model. Every write is idempotent: re-applying the same
// guideRecord/productRecords against already-published source text is a
// safe no-op, detected by id/loc presence rather than re-derived state.

function isIdentifierKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function serializeValue(value, indent) {
  const pad = '  '.repeat(indent);
  const childPad = '  '.repeat(indent + 1);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allPrimitive = value.every((v) => v === null || typeof v !== 'object');
    if (allPrimitive) {
      return `[${value.map((v) => serializeValue(v, indent)).join(', ')}]`;
    }
    const items = value.map((v) => `${childPad}${serializeValue(v, indent + 1)}`).join(',\n');
    return `[\n${items},\n${pad}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const items = keys
      .map((k) => {
        const keyStr = isIdentifierKey(k) ? k : JSON.stringify(k);
        return `${childPad}${keyStr}: ${serializeValue(value[k], indent + 1)}`;
      })
      .join(',\n');
    return `{\n${items},\n${pad}}`;
  }
  throw new Error(`guide-production-writer: cannot serialize value of type ${typeof value}`);
}

/** Renders one plain record as a top-level array-entry object literal, 2-space indented to match js/guides.js / js/products.js's existing hand-authored style. */
export function serializeRecord(record) {
  return `  ${serializeValue(record, 1)}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if an array-of-objects export already contains an object literal with this `id` — the idempotency check every insert below relies on. */
export function recordExists(sourceText, id) {
  const re = new RegExp(`id:\\s*["']${escapeRegExp(id)}["']`);
  return re.test(sourceText);
}

/**
 * Inserts one already-serialized entry immediately before the closing
 * `];` of `export const <exportName> = [ ... ];`. Relies on this repo's
 * existing convention that nested arrays (e.g. `tags: [...]`) always
 * close with `],` (a trailing comma, since they're object properties)
 * while the top-level exported array is the only thing that closes with
 * a bare `];` — true today in both js/guides.js and js/products.js.
 */
export function insertBeforeArrayClose(sourceText, exportName, entryText) {
  const startMarker = `export const ${exportName} = [`;
  const startIdx = sourceText.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`insertBeforeArrayClose: could not find "${startMarker}" in source`);
  }
  const closeIdx = sourceText.indexOf('\n];', startIdx);
  if (closeIdx === -1) {
    throw new Error(`insertBeforeArrayClose: could not find closing "];" for "${exportName}"`);
  }
  return sourceText.slice(0, closeIdx) + '\n' + entryText + ',' + sourceText.slice(closeIdx);
}

/**
 * Idempotently appends `guideId` to an existing product record's
 * `featuredInGuides` array — how the hero-product-to-guide relationship
 * (and every supporting-item-to-guide relationship) gets updated for a
 * product that already exists in the catalog, matching the pattern every
 * multi-guide product already uses (e.g. "oxford-shirt" in js/products.js
 * lists more than one guide id). A no-op (changed: false) if the guide id
 * is already present, so re-running the writer never duplicates it.
 */
export function addGuideToFeaturedInGuides(sourceText, productId, guideId) {
  const idRe = new RegExp(`id:\\s*["']${escapeRegExp(productId)}["']`);
  const idMatch = idRe.exec(sourceText);
  if (!idMatch) {
    throw new Error(`addGuideToFeaturedInGuides: product "${productId}" not found in source`);
  }
  const searchFrom = idMatch.index;
  const fieldRe = /featuredInGuides:\s*\[([^\]]*)\]/;
  const rest = sourceText.slice(searchFrom);
  const fieldMatch = fieldRe.exec(rest);
  if (!fieldMatch) {
    throw new Error(`addGuideToFeaturedInGuides: product "${productId}" has no featuredInGuides field`);
  }
  const currentListRaw = fieldMatch[1];
  if (currentListRaw.includes(`"${guideId}"`) || currentListRaw.includes(`'${guideId}'`)) {
    return { text: sourceText, changed: false };
  }
  const trimmed = currentListRaw.trim();
  const newListRaw = trimmed.length ? `${trimmed.replace(/,\s*$/, '')}, "${guideId}"` : `"${guideId}"`;
  const newField = `featuredInGuides: [${newListRaw}]`;
  const absoluteIndex = searchFrom + fieldMatch.index;
  const text = sourceText.slice(0, absoluteIndex) + newField + sourceText.slice(absoluteIndex + fieldMatch[0].length);
  return { text, changed: true };
}

/**
 * Idempotently inserts one `<url>` entry before `</urlset>` in
 * sitemap.xml, keyed on `loc` (never duplicated on re-run).
 */
export function upsertSitemapUrl(sitemapText, { loc, priority = '0.9' }) {
  if (sitemapText.includes(`<loc>${loc}</loc>`)) {
    return { text: sitemapText, changed: false };
  }
  const entry = `  <url><loc>${loc}</loc><priority>${priority}</priority></url>\n`;
  const closeIdx = sitemapText.indexOf('</urlset>');
  if (closeIdx === -1) {
    throw new Error('upsertSitemapUrl: could not find "</urlset>" in sitemap.xml');
  }
  const text = sitemapText.slice(0, closeIdx) + entry + sitemapText.slice(closeIdx);
  return { text, changed: true };
}

/**
 * The full, pure production plan for one `ready-for-pr` guide-factory
 * result. Never touches disk — returns the complete new source text for
 * every file the caller should write, plus a `changes` log describing
 * exactly what happened, so a repeat run against already-published
 * content is provably a no-op (`applied: false` on every entry) instead
 * of silently re-writing (and potentially duplicating) content.
 */
export function planGuideProduction({
  guidesSourceText,
  productsSourceText,
  sitemapSourceText,
  factoryResult,
}) {
  if (!factoryResult || factoryResult.outcome !== 'ready-for-pr') {
    throw new Error('planGuideProduction: factoryResult.outcome must be "ready-for-pr"');
  }
  const { guideRecord, productRecords, metadata, pageHtml } = factoryResult;
  const changes = [];

  const guideAlreadyPublished = recordExists(guidesSourceText, guideRecord.id);
  let nextGuidesSourceText = guidesSourceText;
  if (guideAlreadyPublished) {
    changes.push({ type: 'guide', id: guideRecord.id, applied: false, reason: 'already present in js/guides.js' });
  } else {
    nextGuidesSourceText = insertBeforeArrayClose(guidesSourceText, 'guides', serializeRecord(guideRecord));
    changes.push({ type: 'guide', id: guideRecord.id, applied: true });
  }

  let nextProductsSourceText = productsSourceText;
  const newProductIds = new Set(productRecords.map((p) => p.id));
  for (const product of productRecords) {
    if (recordExists(nextProductsSourceText, product.id)) {
      changes.push({ type: 'product', id: product.id, applied: false, reason: 'already present in js/products.js' });
      continue;
    }
    nextProductsSourceText = insertBeforeArrayClose(nextProductsSourceText, 'products', serializeRecord(product));
    changes.push({ type: 'product', id: product.id, applied: true });
  }

  // Every already-existing product referenced by this guide (hero or
  // supporting item) that ISN'T one of the brand-new productRecords above
  // needs this guide id added to its own featuredInGuides array — the
  // hero-product-to-guide (and supporting-item-to-guide) relationship
  // update the issue scopes, applied the same idempotent way every
  // existing multi-guide product in js/products.js already demonstrates.
  for (const productId of guideRecord.relatedProducts || []) {
    if (newProductIds.has(productId)) continue; // already featuredInGuides: [guideId] from buildNewProductRecords
    if (!recordExists(nextProductsSourceText, productId)) {
      changes.push({ type: 'featuredInGuides', id: productId, applied: false, reason: `product "${productId}" does not exist — cannot patch featuredInGuides` });
      continue;
    }
    const { text, changed } = addGuideToFeaturedInGuides(nextProductsSourceText, productId, guideRecord.id);
    nextProductsSourceText = text;
    changes.push({ type: 'featuredInGuides', id: productId, applied: changed, reason: changed ? undefined : `guide "${guideRecord.id}" already listed` });
  }

  const { text: nextSitemapSourceText, changed: sitemapChanged } = upsertSitemapUrl(sitemapSourceText, metadata.sitemapEntry);
  changes.push({ type: 'sitemap', id: metadata.sitemapEntry.loc, applied: sitemapChanged, reason: sitemapChanged ? undefined : 'already present in sitemap.xml' });

  const anyApplied = changes.some((c) => c.applied);

  return {
    guideId: guideRecord.id,
    pagePath: guideRecord.slug,
    pageHtml,
    guidesSourceText: nextGuidesSourceText,
    productsSourceText: nextProductsSourceText,
    sitemapSourceText: nextSitemapSourceText,
    changes,
    anyApplied,
    alreadyFullyApplied: !anyApplied,
  };
}
