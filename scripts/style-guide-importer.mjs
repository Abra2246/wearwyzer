// Style Guides folder importer (issue #34) — pure pipeline. Scans a
// directory of external "Style Guides" source documents, converts every
// safely verifiable one into the issue #17 guide-manifest contract
// (scripts/guide-manifest-schema.mjs), skips anything that already exists
// in the canonical site data (js/guides.js), and isolates every
// unresolved or unverifiable fact as `needs-human` instead of guessing
// (CLAUDE.md's content-integrity rule). No I/O in this file —
// scripts/style-guide-importer-cli.mjs reads the real filesystem/site
// data and writes draft manifests + the disposition report.
//
// Canonical spec: docs/STYLE_GUIDE_IMPORTER_V1.md

import { validateGuideManifest } from './guide-manifest-schema.mjs';
import { deriveHeroProductId, buildExistingGuideContext } from './guide-factory.mjs';

export const STRUCTURED_FORMATS = Object.freeze(['.json']);
export const FREEFORM_TEXT_FORMATS = Object.freeze(['.md', '.markdown', '.txt']);
export const KNOWN_UNSUPPORTED_FORMATS = Object.freeze(['.docx', '.doc', '.pdf', '.pages', '.rtf']);

export function extensionOf(filename) {
  const match = /\.[a-zA-Z0-9]+$/.exec(String(filename || ''));
  return match ? match[0].toLowerCase() : '';
}

/** Classifies one source file by extension only — no content sniffing, so the result is always deterministic and explainable. */
export function classifySourceFile(filename) {
  const ext = extensionOf(filename);
  if (STRUCTURED_FORMATS.includes(ext)) return { ext, kind: 'structured' };
  if (FREEFORM_TEXT_FORMATS.includes(ext)) return { ext, kind: 'freeform-text' };
  if (KNOWN_UNSUPPORTED_FORMATS.includes(ext)) return { ext, kind: 'unsupported-binary' };
  return { ext, kind: 'unknown' };
}

function slugifyId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['".]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function baseName(filePath) {
  const parts = String(filePath).split(/[\\/]/);
  const last = parts[parts.length - 1] || '';
  return last.replace(/\.[^.]+$/, '');
}

/**
 * Builds the best-effort draft manifest a structured (.json) source
 * supports. Only fills honest, non-factual scaffolding defaults (job id,
 * schema version, "draft" status, "medium" risk tier, "unverified"
 * confidence, a provenance-only source entry when the document carries
 * no real verified source) — never a product fact, price, or slide the
 * source document didn't actually provide. Missing facts stay missing so
 * validateGuideManifest() reports them, rather than being synthesized
 * here.
 */
export function buildDraftManifestFromStructuredSource(raw, { filePath, now }) {
  const nowIso = now || new Date().toISOString();
  const jobId = raw.jobId || `import-${slugifyId(raw.website?.slugHint || raw.heroProductId || baseName(filePath))}`;
  return {
    schemaVersion: raw.schemaVersion || '1.0.0',
    jobId,
    status: 'draft',
    riskTier: raw.riskTier || 'medium',
    confidence: raw.confidence || 'unverified',
    heroProductId: raw.heroProductId ?? null,
    concept: raw.concept ?? null,
    hook: raw.hook ?? null,
    audience: raw.audience ?? null,
    sources:
      Array.isArray(raw.sources) && raw.sources.length ? raw.sources : [{ url: `file:${filePath}`, verifiedAt: null }],
    productReferences: raw.productReferences || [],
    newProducts: raw.newProducts || [],
    outfits: raw.outfits ?? null,
    slides: raw.slides ?? null,
    website: raw.website ?? null,
    social: raw.social ?? null,
    assets: raw.assets || { rendererMode: 'deterministic-template' },
    publication: raw.publication || { status: 'draft', publishedDate: null },
    createdAt: raw.createdAt || nowIso,
    provenance: { sourcePath: filePath, format: 'json', importedAt: nowIso },
  };
}

/** A freeform text source can never be safely auto-converted into structured facts without guessing — always isolated as needs-human. */
export function buildCandidateFromFreeformSource(rawText, { filePath, now }) {
  const nowIso = now || new Date().toISOString();
  return {
    jobId: `import-${slugifyId(baseName(filePath))}`,
    provenance: { sourcePath: filePath, format: extensionOf(filePath).slice(1) || 'text', importedAt: nowIso },
    excerptLength: String(rawText || '').length,
  };
}

/** Exact-duplicate check against canonical js/guides.js — by slug or title match, never by fuzzy inference (see checkHeroCooldown/checkConceptDuplication for the fuzzier, time-windowed checks already run inside validateGuideManifest). */
export function findExactCanonicalDuplicate(candidateManifest, existingGuides) {
  const candidateSlugHint = candidateManifest.website?.slugHint;
  const candidateTitle = (candidateManifest.website?.title || '').trim().toLowerCase();
  return (
    (existingGuides || []).find((g) => {
      if (candidateSlugHint && g.slug === `guide-${candidateSlugHint}.dc.html`) return true;
      if (candidateTitle && (g.title || '').trim().toLowerCase() === candidateTitle) return true;
      return false;
    }) || null
  );
}

/**
 * Runs one source file through the importer: classify → parse →
 * exact-duplicate check → full manifest validation (shape, stale/missing
 * sources, unresolved product references, fabrication, hero/concept
 * cooldown — reusing scripts/guide-manifest-schema.mjs verbatim, the same
 * gate a hand-authored manifest must pass). Never fabricates a missing
 * fact and never writes anything — scripts/style-guide-importer-cli.mjs
 * decides what to do with the result (write a draft manifest, log a
 * disposition entry).
 */
export function runStyleGuideImportJob(sourceFile, { existingProductIds = new Set(), existingGuides = [], now } = {}) {
  const { ext, kind } = classifySourceFile(sourceFile.path);
  const base = { sourcePath: sourceFile.path, format: ext || '(none)' };

  if (kind === 'unsupported-binary') {
    return {
      ...base,
      disposition: 'needs-human',
      reasons: [
        `unsupported binary format "${ext}" — cannot safely extract structured content without a document-conversion dependency this repo does not have`,
      ],
    };
  }
  if (kind === 'unknown') {
    return {
      ...base,
      disposition: 'needs-human',
      reasons: [
        `unrecognized file format "${ext || '(no extension)'}" — not one of ${[...STRUCTURED_FORMATS, ...FREEFORM_TEXT_FORMATS].join(', ')}`,
      ],
    };
  }
  if (kind === 'freeform-text') {
    const candidate = buildCandidateFromFreeformSource(sourceFile.content, { filePath: sourceFile.path, now });
    return {
      ...base,
      jobId: candidate.jobId,
      disposition: 'needs-human',
      reasons: [
        'freeform text source — auto-extracting outfits/products/sources would require guessing at structure; a human must transcribe it into the guide-manifest JSON contract',
      ],
    };
  }

  // kind === 'structured'
  let raw;
  try {
    raw = JSON.parse(sourceFile.content);
  } catch (err) {
    return { ...base, disposition: 'needs-human', reasons: [`invalid JSON: ${err.message}`] };
  }

  const draftManifest = buildDraftManifestFromStructuredSource(raw, { filePath: sourceFile.path, now });

  const duplicate = findExactCanonicalDuplicate(draftManifest, existingGuides);
  if (duplicate) {
    return {
      ...base,
      jobId: draftManifest.jobId,
      disposition: 'duplicate-skipped',
      reasons: [`already present in canonical js/guides.js as "${duplicate.id}" (slug or title match)`],
    };
  }

  const validation = validateGuideManifest(draftManifest, {
    existingProductIds,
    existingGuides: buildExistingGuideContext(existingGuides),
    now,
  });

  if (!validation.valid) {
    return {
      ...base,
      jobId: draftManifest.jobId,
      disposition: 'needs-human',
      reasons: validation.reasons,
      manifestValidation: validation,
    };
  }

  return { ...base, jobId: draftManifest.jobId, disposition: 'draft-manifest-ready', reasons: ['eligible'], manifest: draftManifest };
}

/** Aggregates every per-file result into one provenance/disposition report. */
export function buildImportDispositionReport(sourceDirectoryExists, results, { scannedAt } = {}) {
  const dispositionCounts = {};
  const formatCounts = {};
  for (const r of results) {
    dispositionCounts[r.disposition] = (dispositionCounts[r.disposition] || 0) + 1;
    formatCounts[r.format] = (formatCounts[r.format] || 0) + 1;
  }
  return {
    scannedAt: scannedAt || new Date().toISOString(),
    sourceDirectoryExists,
    sourceCount: results.length,
    formatCounts,
    dispositionCounts,
    results,
  };
}

// Re-exported so callers (and tests) needing the hero-derivation helper
// don't have to import scripts/guide-factory.mjs separately for it.
export { deriveHeroProductId };
