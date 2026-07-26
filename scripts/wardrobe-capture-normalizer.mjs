export const WARDROBE_CAPTURE_VERSION = 'wardrobe-capture-v1';

export const CAMERA_CAPTURE_FIXTURES = Object.freeze({
  'navy-work-pant': Object.freeze({
    label: 'Navy straight-leg work pant',
    suggestedProductId: 'dickies-874-dark-navy',
    category: 'pants',
    color: 'Dark Navy',
    size: '32x30',
    confidence: 0.78,
  }),
  'barrel-pant': Object.freeze({
    label: 'Relaxed barrel-leg pant',
    query: 'Barrel Pants',
    category: 'pants',
    color: 'Neutral',
    size: 'M',
    confidence: 0.66,
  }),
  'unknown-jacket': Object.freeze({
    label: 'Unbranded cropped utility jacket',
    query: 'Unbranded cropped utility jacket',
    category: 'outerwear',
    color: 'Olive',
    size: 'M',
    confidence: 0.42,
  }),
});

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function field(key, value, provenance, confidence) {
  return {
    key,
    value: String(value ?? '').trim(),
    provenance,
    confidence: Number(Number(confidence).toFixed(2)),
  };
}

export function classifyCanonicalProducts(products, query) {
  const term = normalize(query);
  if (!term) return [];
  const matches = products.filter((product) => {
    const haystack = [product.id, product.name, product.brandId, product.categoryId, product.colorway]
      .map(normalize)
      .join(' ');
    return haystack.includes(term);
  });
  const exactNameCounts = new Map();
  for (const product of matches) {
    const key = normalize(product.name);
    exactNameCounts.set(key, (exactNameCounts.get(key) ?? 0) + 1);
  }
  return matches.slice(0, 12).map((product) => {
    const ambiguous = exactNameCounts.get(normalize(product.name)) > 1;
    const canonicalExact = product.matchType === 'Exact item';
    return {
      productId: product.id,
      name: product.name,
      brandId: product.brandId,
      categoryId: product.categoryId,
      colorway: product.colorway,
      matchState: ambiguous ? 'ambiguous' : canonicalExact ? 'exact' : 'similar',
      matchConfidence: ambiguous ? 0.72 : canonicalExact ? 1 : 0.75,
    };
  });
}

export function createCaptureCandidate({
  source,
  query,
  fixtureId,
  sequence,
  nowIso,
  products,
}) {
  if (!['manual-search', 'simulated-camera'].includes(source)) {
    return { ok: false, error: 'unsupported-capture-source' };
  }
  const candidateId = `fixture-capture-${sequence}`;
  if (source === 'manual-search') {
    const results = classifyCanonicalProducts(products, query);
    const exact = results.length === 1 && results[0].matchState === 'exact' ? results[0] : null;
    const matchState = exact
      ? 'exact'
      : results.some((result) => result.matchState === 'ambiguous')
        ? 'ambiguous'
        : results.length
          ? 'similar'
          : 'unknown';
    return {
      ok: true,
      candidate: {
        schemaVersion: WARDROBE_CAPTURE_VERSION,
        candidateId,
        source,
        status: 'review-required',
        rawReference: { kind: 'manual-query', value: String(query ?? '').trim() },
        fields: [
          field('product', exact?.name ?? String(query ?? '').trim(), 'manual-entry', 1),
          field('brand', exact?.brandId ?? '', exact ? 'canonical-match' : 'not-confirmed', exact ? 1 : 0),
          field('category', exact?.categoryId ?? '', exact ? 'canonical-match' : 'not-confirmed', exact ? 1 : 0),
          field('color', exact?.colorway ?? '', exact ? 'canonical-match' : 'not-confirmed', exact ? 1 : 0),
          field('size', '', 'not-provided', 0),
        ],
        match: {
          state: matchState,
          productId: exact?.productId ?? null,
          confidence: exact ? 1 : Math.max(0, ...results.map((result) => result.matchConfidence)),
          options: results,
          resolution: exact ? 'canonical-query' : null,
        },
        correctionVersion: 0,
        corrections: [],
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      },
    };
  }

  const fixture = CAMERA_CAPTURE_FIXTURES[fixtureId];
  if (!fixture) return { ok: false, error: 'unknown-camera-fixture' };
  const suggested = products.find((product) => product.id === fixture.suggestedProductId);
  const results = suggested
    ? classifyCanonicalProducts(products, suggested.id)
    : classifyCanonicalProducts(products, fixture.query);
  const matchState = suggested
    ? 'suggested'
    : results.some((result) => result.matchState === 'ambiguous')
      ? 'ambiguous'
      : results.length
        ? 'similar'
        : 'unknown';
  return {
    ok: true,
    candidate: {
      schemaVersion: WARDROBE_CAPTURE_VERSION,
      candidateId,
      source,
      status: 'review-required',
      rawReference: { kind: 'synthetic-fixture-id', value: fixtureId },
      fields: [
        field('product', suggested?.name ?? fixture.label, 'simulated-camera-inference', fixture.confidence),
        field('brand', suggested?.brandId ?? '', 'simulated-camera-inference', suggested ? fixture.confidence : 0),
        field('category', suggested?.categoryId ?? fixture.category, 'simulated-camera-inference', fixture.confidence),
        field('color', fixture.color, 'simulated-camera-inference', fixture.confidence),
        field('size', fixture.size, 'simulated-camera-inference', Math.max(0, fixture.confidence - 0.18)),
      ],
      match: {
        state: matchState,
        productId: null,
        confidence: fixture.confidence,
        options: results,
        resolution: null,
      },
      correctionVersion: 0,
      corrections: [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
  };
}

export function correctCaptureCandidate(candidate, correction, products, nowIso) {
  if (!candidate || candidate.status !== 'review-required') {
    return { ok: false, error: 'capture-not-reviewable' };
  }
  const product = products.find((entry) => entry.id === correction.productId);
  if (!product || product.matchType !== 'Exact item') {
    return { ok: false, error: 'exact-product-required' };
  }
  const nextVersion = candidate.correctionVersion + 1;
  const values = {
    product: product.name,
    brand: product.brandId,
    category: product.categoryId,
    color: String(correction.color || product.colorway).trim(),
    size: String(correction.size ?? '').trim(),
  };
  const correctedFields = Object.entries(values).map(([key, value]) =>
    field(key, value, 'explicit-user-correction', 1)
  );
  const correctionRecord = {
    correctionId: `${candidate.candidateId}-correction-v${nextVersion}`,
    version: nextVersion,
    productId: product.id,
    fields: correctedFields,
    correctedAtIso: nowIso,
  };
  return {
    ok: true,
    candidate: {
      ...structuredClone(candidate),
      fields: correctedFields,
      match: {
        state: 'exact',
        productId: product.id,
        confidence: 1,
        options: candidate.match.options,
        resolution: 'explicit-user-correction',
      },
      correctionVersion: nextVersion,
      corrections: [...candidate.corrections, correctionRecord],
      updatedAtIso: nowIso,
    },
    correction: correctionRecord,
  };
}
