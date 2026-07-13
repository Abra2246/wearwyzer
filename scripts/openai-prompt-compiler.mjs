// WearWyzer prompt compiler (issue #18, section 2). Pure — no I/O, no
// network. Compiles a guide manifest + slide spec into a versioned,
// structured prompt for the "editorial imagery" layer only — this
// module never compiles a "final layout" prompt, because the hybrid
// rendering architecture (issue #18 section 3) never asks the image
// model to typeset headlines/prices/logos/slide numbers; that stays a
// deterministic pass (scripts/openai-hybrid-renderer.mjs's SVG
// compositor over scripts/guide-renderer-adapter.mjs's palette).
//
// Canonical spec: docs/OPENAI_IMAGE_RENDERER_V1.md

export const PROMPT_SCHEMA_VERSION = '1.0.0';

// Matches scripts/guide-renderer-adapter.mjs's PALETTE — described in
// words here since the prompt is text, not a style token.
export const WEARWYZER_VISUAL_LANGUAGE =
  'Warm editorial fashion photography matching WearWyzer\'s palette (cream #F6F1E8 backgrounds, ' +
  'deep ink #0B0B0B contrast, warm gold #C8941E accent), clean minimal styling, natural daylight, ' +
  'magazine-quality composition, no visible studio backdrop clutter.';

// Every one of these is a hard constraint, not a preference — a
// generation whose revised prompt / visual QA signals contradict any of
// these is rejected by scripts/reference-preservation-check.mjs, never
// silently accepted.
export const HARD_EXCLUSIONS = Object.freeze([
  "Do not change the verified product's colorway.",
  "Do not change the verified product's silhouette or garment category.",
  'Do not alter or invent visible logo placement.',
  'Do not render any legible text, numerals, or typography anywhere in the image — headlines, ' +
    'prices, product lists, and slide numbers are added afterward by a deterministic layout pass, ' +
    'never by the image model.',
  'Do not duplicate limbs, hands, or other anatomical features.',
  'Do not depict a different hero product than the one described below.',
]);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function findOutfitForSlide(manifest, slideSpec) {
  const outfits = manifest?.outfits || [];
  return outfits.find((o) => o.name === slideSpec?.label) || null;
}

/**
 * Compiles the editorial-imagery prompt layer for one slide. Never
 * fabricates a product fact: hero identity/colorway/outfit composition
 * are read verbatim from the manifest and heroProduct record, and the
 * prompt explicitly states when no verified reference image was
 * supplied (issue #18 section 4 — uncertain provenance must be flagged,
 * not guessed past).
 */
export function compileEditorialPrompt({ manifest, heroProduct = null, slideSpec, referenceImageSupplied = false }) {
  if (!manifest) throw new Error('compileEditorialPrompt: manifest is required');
  if (!slideSpec) throw new Error('compileEditorialPrompt: slideSpec is required');

  const outfit = findOutfitForSlide(manifest, slideSpec);
  const itemDescriptions = outfit ? (outfit.items || []).map((it) => it.editorialLabel || it.name).filter(Boolean).join(', ') : '';
  const heroName = (heroProduct && heroProduct.name) || manifest.heroProductId;
  const heroColorway = heroProduct && heroProduct.colorway;

  const lines = [
    `Hero product: ${heroName}${heroColorway ? ` in ${heroColorway}` : ''}.`,
    referenceImageSupplied
      ? 'A verified reference image of the hero product is attached — match its exact colorway, silhouette, and logo placement exactly.'
      : 'No verified reference image was supplied for this hero product — product identity is unverified; this generation must be routed to human review before acceptance.',
    outfit ? `Outfit composition ("${outfit.name}"${outfit.when ? `, ${outfit.when}` : ''}): ${itemDescriptions}.` : '',
    slideSpec.copy ? `Editorial direction: ${slideSpec.copy}` : '',
    'Model presentation: one editorial model, natural candid pose, WearWyzer audience-appropriate styling.',
    outfit?.when ? `Setting: everyday real-world location matching "${outfit.when}", not a studio seamless backdrop.` : '',
    'Camera: 50mm-equivalent portrait framing, shallow depth of field, three-quarter or full-body composition.',
    'Lighting: soft natural daylight, warm color temperature.',
    `Visual language: ${WEARWYZER_VISUAL_LANGUAGE}`,
    'Exclusions:',
    ...HARD_EXCLUSIONS.map((e) => `- ${e}`),
  ].filter(isNonEmptyString);

  return {
    version: PROMPT_SCHEMA_VERSION,
    layer: 'editorial-imagery',
    slideOrder: slideSpec.order,
    editorialPrompt: lines.join('\n'),
    exclusions: HARD_EXCLUSIONS,
    referenceImageSupplied: !!referenceImageSupplied,
  };
}

/**
 * The layout layer never goes to the image model — this function exists
 * only so a caller can assert (and unit-test) that it never does. It
 * always throws: there is no valid compiled prompt for final typography,
 * because deterministic rendering (scripts/guide-renderer-adapter.mjs /
 * scripts/openai-hybrid-renderer.mjs's compositor) owns that layer
 * exclusively (issue #18 section 3).
 */
export function compileFinalLayoutPrompt() {
  throw new Error(
    'compileFinalLayoutPrompt: the hybrid rendering architecture never sends final typography/layout ' +
      '(headlines, prices, product lists, logos, slide numbers) to the image model — that stays a ' +
      'deterministic SVG/HTML pass. See docs/OPENAI_IMAGE_RENDERER_V1.md section 3.'
  );
}
