// Deterministic guide factory pipeline (issue #17, section 2). Pure
// orchestration — every function takes plain data in and returns plain
// data out; the only I/O (reading manifest files, writing generated
// output) lives in scripts/guide-factory-cli.mjs, matching the split
// already established between scripts/queue-rules.mjs (pure) and
// scripts/queue-dispatch.mjs (I/O).
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md
//
// The pipeline never guesses: if a manifest is missing a fact, stale, a
// duplicate, or fails any validator, `runGuideFactoryJob` returns
// `outcome: 'needs-human'` with a specific, actionable set of reasons
// instead of proceeding with a best effort.

import { validateGuideManifest } from './guide-manifest-schema.mjs';
import { runContentQualityPolicy } from './content-quality-policy.mjs';
import { renderSlides } from './guide-renderer-adapter.mjs';
import { renderGuidePageHtml } from './guide-page-template.mjs';

/**
 * Existing guides only carry an implicit hero product (the productId
 * present in every one of the guide's outfits) — there is no explicit
 * `heroProductId` field in js/guides.js today (see
 * docs/HERO_PRODUCT_V1.md, which had to document this by hand for the
 * one guide it covers). This derives it the same way, generically, so
 * the factory's duplication check works against the real data without
 * requiring a schema change to js/guides.js.
 */
export function deriveHeroProductId(guide) {
  const outfits = guide.outfits || [];
  if (outfits.length === 0) return null;
  let common = null;
  for (const outfit of outfits) {
    const ids = new Set((outfit.items || []).map((it) => it.productId).filter(Boolean));
    common = common === null ? ids : new Set([...common].filter((id) => ids.has(id)));
    if (common.size === 0) return null;
  }
  return common && common.size === 1 ? [...common][0] : null;
}

/** Projects real (or fixture) js/guides.js records into the shape guide-manifest-schema.mjs's dedup checks expect. */
export function buildExistingGuideContext(guides) {
  return (guides || []).map((g) => ({
    id: g.id,
    heroProductId: deriveHeroProductId(g),
    concept: g.verdict,
    hook: g.description,
    publishedDate: g.publishedDate,
  }));
}

/** Single-flight selection: at most one guide job in flight at a time, oldest `approved` job first. */
export function selectNextApprovedJob(jobs) {
  const inProgress = (jobs || []).find((j) => j.status === 'in-progress');
  if (inProgress) return { selected: null, reason: `job "${inProgress.jobId}" is already in-progress` };

  const approved = (jobs || [])
    .filter((j) => j.status === 'approved')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (approved.length === 0) return { selected: null, reason: 'no approved job in the queue' };
  return { selected: approved[0], reason: null };
}

function slugifyId(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['".]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds the js/guides.js-shaped record the factory would write for an approved manifest. */
export function buildGuideRecord(manifest) {
  const guideId = manifest.jobId;
  const slug = `guide-${manifest.website.slugHint}.dc.html`;
  const relatedProducts = computeRelatedProductIds(manifest);

  return {
    id: guideId,
    heroProductId: manifest.heroProductId,
    title: manifest.website.title,
    slug,
    verdict: manifest.concept,
    description: manifest.hook,
    coverImage: `assets/images/guides/${slugifyId(guideId)}/cover.svg`,
    slideImages: manifest.slides
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        src: `assets/images/guides/${slugifyId(guideId)}/slide-${String(s.order).padStart(2, '0')}.svg`,
        label: s.label,
      })),
    outfitCount: manifest.outfits.length,
    outfits: manifest.outfits,
    styleNotes: manifest.styleNotes || [],
    relatedProducts,
    instagramUrl: '',
    publishedDate: manifest.publication.publishedDate || null,
    tags: manifest.website.tags || [],
    comingSoon: manifest.publication.status !== 'published',
  };
}

/** Every distinct productId referenced by the hero field or any outfit item, in first-seen order. */
export function computeRelatedProductIds(manifest) {
  const ids = [];
  const seen = new Set();
  const add = (id) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  add(manifest.heroProductId);
  for (const pid of manifest.productReferences || []) add(pid);
  for (const outfit of manifest.outfits) {
    for (const item of outfit.items) add(item.productId);
  }
  return ids;
}

/** Product records the factory would append to js/products.js — copied verbatim from the manifest's own honest declarations, never invented here. */
export function buildNewProductRecords(manifest, guideRecord) {
  return (manifest.newProducts || []).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand || '',
    category: p.category,
    colorway: p.colorway || '',
    image: p.image,
    price: p.price ?? null,
    priceStatus: p.priceStatus || 'tbd',
    retailer: p.retailer || '',
    affiliateUrl: p.affiliateUrl || '',
    exactOrSimilar: p.exactOrSimilar || 'Similar option',
    tags: p.tags || [],
    featuredInGuides: [guideRecord.id],
    lastChecked: p.priceStatus === 'confirmed' ? p.lastChecked || null : '',
  }));
}

/** Structured slide specs (deterministic layout — see docs/AUTONOMOUS_GUIDE_FACTORY_V1.md §7). */
export function generateSlideSpecs(manifest) {
  return manifest.slides
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      order: s.order,
      label: s.label,
      copy: s.copy,
      altText: s.altText,
      width: 1080,
      height: 1350,
    }));
}

/** Caption, alt text, SEO metadata, sitemap entry, and internal links (issue #17 section 2). */
export function generateMetadata(manifest, guideRecord) {
  return {
    social: {
      caption: manifest.social.caption,
      altText: manifest.social.altText,
    },
    seo: {
      title: `${guideRecord.title} — WearWyzer`,
      description: manifest.website.description,
    },
    sitemapEntry: {
      loc: `https://www.wearwyzer.com/${guideRecord.slug.replace(/\.dc\.html$/, '.html')}`,
      priority: '0.9',
    },
    internalLinks: {
      guidePageHref: guideRecord.slug,
      relatedProductIds: guideRecord.relatedProducts,
    },
  };
}

/**
 * Runs the complete pipeline for one approved manifest against a
 * Knowledge Graph snapshot (`existingProductIds`, `existingGuides`).
 * Never mutates anything — the caller (scripts/guide-factory-cli.mjs) is
 * responsible for writing files and opening a PR only when
 * `outcome === 'ready-for-pr'`.
 */
export function runGuideFactoryJob(manifest, {
  existingProductIds = new Set(),
  existingGuides = [],
  rendererMode,
  rendererProviderConfig = null,
  now,
} = {}) {
  const resolvedRendererMode = rendererMode || (manifest.assets && manifest.assets.rendererMode) || 'deterministic-template';
  const manifestValidation = validateGuideManifest(manifest, {
    existingProductIds,
    existingGuides: buildExistingGuideContext(existingGuides),
    now,
  });

  if (!manifestValidation.valid) {
    return {
      outcome: 'needs-human',
      stage: 'manifest-validation',
      reasons: manifestValidation.reasons,
      manifestValidation,
    };
  }

  const guideRecord = buildGuideRecord(manifest);
  const productRecords = buildNewProductRecords(manifest, guideRecord);
  const slideSpecs = generateSlideSpecs(manifest);
  const renderedAssets = renderSlides(slideSpecs, { mode: resolvedRendererMode, providerConfig: rendererProviderConfig });
  const metadata = generateMetadata(manifest, guideRecord);

  const rendererBlocked = renderedAssets.some((a) => a.status !== 'rendered');
  if (resolvedRendererMode === 'deterministic-template' && rendererBlocked) {
    // The default path always renders — a blocked result here means a
    // programming error, not a missing credential, so treat it as a
    // hard stop rather than silently shipping an incomplete carousel.
    return {
      outcome: 'needs-human',
      stage: 'rendering',
      reasons: ['deterministic renderer reported a blocked slide unexpectedly'],
      renderedAssets,
    };
  }

  const policyResult = runContentQualityPolicy({
    manifest,
    guideRecord,
    productRecords,
    slideSpecs,
    renderedAssets,
  });

  if (!policyResult.passed) {
    return {
      outcome: 'needs-human',
      stage: 'content-quality-policy',
      reasons: policyResult.blockingViolations,
      policyResult,
      // Slide specifications stay complete and visible even when the
      // job stops here — never pretend an asset exists, but never
      // discard the spec either (issue #17 §7).
      slideSpecs,
      renderedAssets,
    };
  }

  return {
    outcome: 'ready-for-pr',
    stage: 'complete',
    reasons: ['eligible'],
    manifest,
    guideRecord,
    productRecords,
    slideSpecs,
    renderedAssets,
    metadata,
    policyResult,
    haltsForReview: true, // a guide is always at least risk-medium — never auto-merges (docs/AUTONOMOUS_ENGINEERING_V1.md)
    pageHtml: renderGuidePageHtml({
      guideId: guideRecord.id,
      heroProductId: guideRecord.heroProductId,
      title: guideRecord.title,
      description: guideRecord.description,
      coverImage: guideRecord.coverImage,
      publishedDateIso: guideRecord.publishedDate || undefined,
      breadcrumbLabel: manifest.website.breadcrumbLabel || guideRecord.title,
    }),
  };
}
