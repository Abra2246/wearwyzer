export const AI_STYLIST_VERSION = 'ai-stylist-contract-v1';
export const STYLIST_INTENTS = Object.freeze([
  'style-owned-item',
  'plan-occasion',
  'evaluate-purchase',
  'identify-gap',
  'compare-options',
  'explain-recommendation',
]);
export const EVIDENCE_TYPES = Object.freeze([
  'profile',
  'wardrobe-snapshot',
  'wear-dna',
  'product',
  'offer',
  'purchase-evaluation',
  'outfit-plan',
]);
export const EVIDENCE_STATES = Object.freeze([
  'accepted',
  'stale',
  'ambiguous',
  'conflicting',
  'missing',
]);
export const CLAIM_TYPES = Object.freeze(['fact', 'derived-signal', 'editorial-guidance']);

const EVIDENCE_FACT_ALLOWLISTS = Object.freeze({
  profile: ['styleTags', 'preferredFitTags', 'avoidedBrandIds', 'budgetBand'],
  'wardrobe-snapshot': ['confirmedOwnedItemIds', 'snapshotItemCount'],
  'wear-dna': ['itemId', 'wearState', 'wearCountBucket', 'recencyBucket', 'condition'],
  product: ['productId', 'name', 'colorway', 'category', 'sourceVerifiedAtIso'],
  offer: ['productId', 'merchantId', 'priceUsd', 'currency', 'availability', 'verifiedAtIso'],
  'purchase-evaluation': [
    'productId',
    'recommendation',
    'confidence',
    'compatibilityScore',
    'versatilityScore',
    'gapCoverageScore',
    'redundancyScore',
    'outfitUnlocks',
  ],
  'outfit-plan': ['planId', 'status', 'confidence', 'usedItemIds', 'gapCategories'],
});

function clone(value) {
  return structuredClone(value);
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function exactKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function normalizeEvidence(record) {
  const allowedFacts = EVIDENCE_FACT_ALLOWLISTS[record.type] ?? [];
  if (!exactKeys(record.facts ?? {}, allowedFacts)) {
    return { ok: false, error: 'evidence-fact-not-allowlisted', evidenceId: record.evidenceId };
  }
  return {
    ok: true,
    evidence: {
      evidenceId: String(record.evidenceId ?? ''),
      type: record.type,
      version: Number(record.version),
      state: record.state,
      facts: clone(record.facts ?? {}),
      verifiedAtIso: record.verifiedAtIso ?? null,
    },
  };
}

export function createStylistRequest(input, { nowIso }) {
  if (!input?.requestId || !STYLIST_INTENTS.includes(input?.intent)) {
    return { ok: false, error: 'supported-request-and-intent-required' };
  }
  if (!validIso(nowIso)) return { ok: false, error: 'valid-current-time-required' };
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
    return { ok: false, error: 'evidence-required' };
  }
  const normalized = [];
  for (const record of input.evidence) {
    if (!record?.evidenceId || !EVIDENCE_TYPES.includes(record?.type)) {
      return { ok: false, error: 'supported-evidence-reference-required' };
    }
    if (!Number.isInteger(Number(record.version)) || Number(record.version) < 1) {
      return { ok: false, error: 'valid-evidence-version-required' };
    }
    if (!EVIDENCE_STATES.includes(record.state)) {
      return { ok: false, error: 'supported-evidence-state-required' };
    }
    if (record.verifiedAtIso && !validIso(record.verifiedAtIso)) {
      return { ok: false, error: 'valid-evidence-time-required' };
    }
    const result = normalizeEvidence(record);
    if (!result.ok) return result;
    normalized.push(result.evidence);
  }
  if (new Set(normalized.map((record) => record.evidenceId)).size !== normalized.length) {
    return { ok: false, error: 'duplicate-evidence-reference' };
  }
  return {
    ok: true,
    request: {
      schemaVersion: AI_STYLIST_VERSION,
      requestId: input.requestId,
      version: 1,
      fixtureOnly: true,
      intent: input.intent,
      promptCategory: String(input.promptCategory ?? input.intent).trim(),
      privatePrompt: String(input.privatePrompt ?? '').trim() || null,
      evidence: normalized,
      corrections: [],
      status: 'ready',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
  };
}

export function correctStylistRequest(request, input, { nowIso }) {
  if (!request || request.schemaVersion !== AI_STYLIST_VERSION) {
    return { ok: false, error: 'supported-stylist-request-required' };
  }
  if (!Object.keys(input ?? {}).length) return { ok: false, error: 'no-stylist-correction' };
  const recreated = createStylistRequest({
    requestId: request.requestId,
    intent: input.intent ?? request.intent,
    promptCategory: input.promptCategory ?? request.promptCategory,
    privatePrompt: input.privatePrompt ?? request.privatePrompt,
    evidence: input.evidence ?? request.evidence,
  }, { nowIso });
  if (!recreated.ok) return recreated;
  const next = recreated.request;
  next.version = request.version + 1;
  next.createdAtIso = request.createdAtIso;
  next.corrections = [
    ...clone(request.corrections),
    {
      correctionId: `${request.requestId}-correction-v${next.version}`,
      version: next.version,
      correctedFields: Object.keys(input).sort(),
      provenance: 'explicit-user-correction',
      confidence: 1,
      correctedAtIso: nowIso,
    },
  ];
  return { ok: true, request: next };
}

function evidenceById(request) {
  return new Map(request.evidence.map((record) => [record.evidenceId, record]));
}

function acceptedWardrobeItemIds(request) {
  return new Set(
    request.evidence
      .filter((record) => record.type === 'wardrobe-snapshot' && record.state === 'accepted')
      .flatMap((record) => record.facts.confirmedOwnedItemIds ?? []),
  );
}

function matchingFact(record, factKey, factValue) {
  if (!record || !(factKey in record.facts)) return false;
  return JSON.stringify(record.facts[factKey]) === JSON.stringify(factValue);
}

function abstention(request, reasons, citationIds = []) {
  return {
    ok: true,
    response: {
      schemaVersion: AI_STYLIST_VERSION,
      requestId: request.requestId,
      requestVersion: request.version,
      intent: request.intent,
      outcome: 'abstain',
      claims: [],
      citations: uniqueStrings(citationIds),
      uncertainty: 1,
      opposingEvidence: uniqueStrings(reasons),
      nextStep: 'request-current-or-unambiguous-evidence',
      externalActionTaken: false,
    },
  };
}

export function validateAndBuildStylistResponse(request, draft) {
  if (!request || request.schemaVersion !== AI_STYLIST_VERSION || request.status !== 'ready') {
    return { ok: false, error: 'active-stylist-request-required' };
  }
  if (!Array.isArray(draft?.claims)) return { ok: false, error: 'claims-required' };
  const records = evidenceById(request);
  const ownedItemIds = acceptedWardrobeItemIds(request);
  const weakEvidence = request.evidence.filter((record) => record.state !== 'accepted');
  if (draft.claims.length === 0 || weakEvidence.length > 0) {
    const reasons = draft.claims.length === 0
      ? ['No supported material claim was available']
      : weakEvidence.map((record) => `${record.evidenceId}:${record.state}`);
    return abstention(request, reasons, weakEvidence.map((record) => record.evidenceId));
  }

  const normalizedClaims = [];
  const allCitations = [];
  for (const claim of draft.claims) {
    if (!claim?.claimId || !CLAIM_TYPES.includes(claim?.claimType) || !String(claim?.text ?? '').trim()) {
      return { ok: false, error: 'valid-material-claim-required' };
    }
    const citations = uniqueStrings(claim.citations);
    if (citations.length === 0) {
      return { ok: false, error: 'material-claim-citation-required', claimId: claim.claimId };
    }
    const citedRecords = citations.map((id) => records.get(id));
    if (citedRecords.some((record) => !record)) {
      return { ok: false, error: 'unknown-evidence-citation', claimId: claim.claimId };
    }
    if (citedRecords.some((record) => record.state !== 'accepted')) {
      return abstention(request, ['Claim cites non-current or conflicting evidence'], citations);
    }
    if (claim.subject?.kind === 'owned-item' && !ownedItemIds.has(claim.subject.itemId)) {
      return { ok: false, error: 'unowned-item-claim', claimId: claim.claimId };
    }
    if (claim.claimType === 'fact') {
      if (!claim.factKey || !citedRecords.some((record) => matchingFact(
        record,
        claim.factKey,
        claim.factValue,
      ))) {
        return { ok: false, error: 'fact-not-grounded', claimId: claim.claimId };
      }
    }
    normalizedClaims.push({
      claimId: claim.claimId,
      claimType: claim.claimType,
      text: String(claim.text).trim(),
      subject: claim.subject ? clone(claim.subject) : null,
      citations,
      confidence: Math.max(0, Math.min(1, Number(claim.confidence ?? 0))),
      opposingEvidence: uniqueStrings(claim.opposingEvidence),
    });
    allCitations.push(...citations);
  }

  const averageConfidence = normalizedClaims.reduce(
    (sum, claim) => sum + claim.confidence,
    0,
  ) / normalizedClaims.length;
  return {
    ok: true,
    response: {
      schemaVersion: AI_STYLIST_VERSION,
      requestId: request.requestId,
      requestVersion: request.version,
      intent: request.intent,
      outcome: 'answer',
      claims: normalizedClaims,
      citations: uniqueStrings(allCitations),
      uncertainty: Number((1 - averageConfidence).toFixed(2)),
      opposingEvidence: uniqueStrings(draft.opposingEvidence),
      nextStep: String(draft.nextStep ?? '').trim() || null,
      externalActionTaken: false,
    },
  };
}

export function buildMinimizedStylistResponse(response, request) {
  if (
    !response
    || response.schemaVersion !== AI_STYLIST_VERSION
    || !request
    || request.schemaVersion !== AI_STYLIST_VERSION
  ) {
    return { ok: false, error: 'valid-stylist-response-required' };
  }
  const citationCatalog = Object.fromEntries(
    response.citations.map((evidenceId) => {
      const record = request.evidence.find((candidate) => candidate.evidenceId === evidenceId);
      return [evidenceId, {
        evidenceId,
        type: record.type,
        version: record.version,
        state: record.state,
      }];
    }),
  );
  return {
    ok: true,
    response: {
      requestId: response.requestId,
      requestVersion: response.requestVersion,
      intent: response.intent,
      outcome: response.outcome,
      claims: clone(response.claims),
      citationCatalog,
      uncertainty: response.uncertainty,
      opposingEvidence: clone(response.opposingEvidence),
      nextStep: response.nextStep,
      externalActionTaken: false,
    },
  };
}

export function invalidateStylistRequest(request, { nowIso, reason = 'deleted' }) {
  if (!request || request.schemaVersion !== AI_STYLIST_VERSION || !validIso(nowIso)) {
    return { ok: false, error: 'supported-stylist-request-required' };
  }
  const next = clone(request);
  next.version += 1;
  next.status = 'invalidated';
  next.privatePrompt = null;
  next.evidence = [];
  next.invalidatedAtIso = nowIso;
  next.invalidationReason = reason;
  next.updatedAtIso = nowIso;
  return { ok: true, request: next };
}
