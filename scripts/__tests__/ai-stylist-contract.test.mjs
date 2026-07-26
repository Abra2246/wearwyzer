import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMinimizedStylistResponse,
  correctStylistRequest,
  createStylistRequest,
  invalidateStylistRequest,
  validateAndBuildStylistResponse,
} from '../ai-stylist-contract.mjs';

const NOW = '2026-07-26T02:00:00.000Z';

function evidence(overrides = {}) {
  return [
    {
      evidenceId: 'wardrobe-v7',
      type: 'wardrobe-snapshot',
      version: 7,
      state: 'accepted',
      facts: {
        confirmedOwnedItemIds: ['shoe-1', 'trouser-1'],
        snapshotItemCount: 2,
      },
      verifiedAtIso: NOW,
    },
    {
      evidenceId: 'product-samba-v3',
      type: 'product',
      version: 3,
      state: 'accepted',
      facts: {
        productId: 'adidas-samba-og-b75806',
        name: 'adidas Samba OG',
        colorway: 'Cloud White / Core Black / Gum',
        category: 'footwear',
        sourceVerifiedAtIso: NOW,
      },
      verifiedAtIso: NOW,
    },
    {
      evidenceId: 'evaluation-v1',
      type: 'purchase-evaluation',
      version: 1,
      state: 'accepted',
      facts: {
        productId: 'adidas-samba-og-b75806',
        recommendation: 'buy',
        confidence: 0.91,
        compatibilityScore: 0.94,
        versatilityScore: 0.9,
        gapCoverageScore: 0.82,
        redundancyScore: 0.18,
        outfitUnlocks: 8,
      },
      verifiedAtIso: NOW,
    },
  ].map((record) => (
    record.evidenceId === overrides.evidenceId ? { ...record, ...overrides } : record
  ));
}

function request(overrides = {}) {
  return createStylistRequest({
    requestId: 'stylist-request-1',
    intent: 'evaluate-purchase',
    promptCategory: 'purchase decision',
    privatePrompt: 'Should I buy these shoes?',
    evidence: evidence(),
    ...overrides,
  }, { nowIso: NOW });
}

function groundedDraft() {
  return {
    claims: [
      {
        claimId: 'claim-owned',
        claimType: 'fact',
        text: 'The white sneaker is already in your confirmed wardrobe.',
        subject: { kind: 'owned-item', itemId: 'shoe-1' },
        factKey: 'confirmedOwnedItemIds',
        factValue: ['shoe-1', 'trouser-1'],
        citations: ['wardrobe-v7'],
        confidence: 1,
        opposingEvidence: [],
      },
      {
        claimId: 'claim-evaluation',
        claimType: 'derived-signal',
        text: 'The verified evaluation supports buying the Samba.',
        subject: { kind: 'product', productId: 'adidas-samba-og-b75806' },
        citations: ['evaluation-v1', 'product-samba-v3'],
        confidence: 0.91,
        opposingEvidence: ['Some footwear redundancy remains'],
      },
    ],
    opposingEvidence: ['Redundancy score is not zero'],
    nextStep: 'Review eight supported outfit unlocks',
  };
}

test('creates a versioned fixture request with an allowed intent and evidence', () => {
  const result = request();
  assert.equal(result.ok, true);
  assert.equal(result.request.version, 1);
  assert.equal(result.request.intent, 'evaluate-purchase');
  assert.equal(result.request.fixtureOnly, true);
});

test('rejects unsupported intents, evidence types, and non-allowlisted facts', () => {
  assert.equal(request({ intent: 'buy-this-for-me' }).error, 'supported-request-and-intent-required');
  const wrongType = evidence();
  wrongType[0] = { ...wrongType[0], type: 'calendar' };
  assert.equal(request({ evidence: wrongType }).error, 'supported-evidence-reference-required');
  const privateFact = evidence();
  privateFact[0].facts = { ...privateFact[0].facts, privateOccasionNote: 'Secret' };
  assert.equal(request({ evidence: privateFact }).error, 'evidence-fact-not-allowlisted');
});

test('builds an answer when every material claim has accepted citations', () => {
  const created = request();
  const result = validateAndBuildStylistResponse(created.request, groundedDraft());
  assert.equal(result.ok, true);
  assert.equal(result.response.outcome, 'answer');
  assert.equal(result.response.claims.length, 2);
  assert.deepEqual(result.response.citations, [
    'wardrobe-v7',
    'evaluation-v1',
    'product-samba-v3',
  ]);
  assert.equal(result.response.externalActionTaken, false);
});

test('rejects material claims without citations or with unknown evidence', () => {
  const created = request().request;
  const missing = groundedDraft();
  missing.claims[0].citations = [];
  assert.equal(
    validateAndBuildStylistResponse(created, missing).error,
    'material-claim-citation-required',
  );
  const unknown = groundedDraft();
  unknown.claims[0].citations = ['not-real'];
  assert.equal(validateAndBuildStylistResponse(created, unknown).error, 'unknown-evidence-citation');
});

test('rejects claims that describe an unconfirmed item as owned', () => {
  const draft = groundedDraft();
  draft.claims[0].subject.itemId = 'jacket-not-owned';
  const result = validateAndBuildStylistResponse(request().request, draft);
  assert.equal(result.error, 'unowned-item-claim');
});

test('rejects a product or price fact not present in cited evidence', () => {
  const draft = groundedDraft();
  draft.claims[0] = {
    ...draft.claims[0],
    claimType: 'fact',
    text: 'The shoe costs $100.',
    factKey: 'priceUsd',
    factValue: 100,
    citations: ['product-samba-v3'],
  };
  assert.equal(
    validateAndBuildStylistResponse(request().request, draft).error,
    'fact-not-grounded',
  );
});

test('stale, ambiguous, or conflicting evidence produces abstention', () => {
  for (const state of ['stale', 'ambiguous', 'conflicting']) {
    const records = evidence({ evidenceId: 'product-samba-v3', state });
    const created = request({ evidence: records });
    const result = validateAndBuildStylistResponse(created.request, groundedDraft());
    assert.equal(result.response.outcome, 'abstain');
    assert.equal(result.response.claims.length, 0);
    assert.equal(result.response.externalActionTaken, false);
  }
});

test('an empty supported draft abstains instead of inventing an answer', () => {
  const result = validateAndBuildStylistResponse(request().request, { claims: [] });
  assert.equal(result.ok, true);
  assert.equal(result.response.outcome, 'abstain');
  assert.match(result.response.opposingEvidence[0], /No supported material claim/);
});

test('explicit corrections create a new immutable request version', () => {
  const original = request().request;
  const corrected = correctStylistRequest(original, {
    intent: 'explain-recommendation',
    privatePrompt: 'Explain the evidence.',
  }, { nowIso: '2026-07-26T03:00:00.000Z' });
  assert.equal(corrected.ok, true);
  assert.equal(corrected.request.version, 2);
  assert.equal(corrected.request.intent, 'explain-recommendation');
  assert.equal(corrected.request.corrections.length, 1);
  assert.equal(original.version, 1);
});

test('minimized response exposes citation metadata but no raw private evidence', () => {
  const created = request().request;
  const built = validateAndBuildStylistResponse(created, groundedDraft()).response;
  const minimized = buildMinimizedStylistResponse(built, created);
  const serialized = JSON.stringify(minimized.response);
  assert.equal(minimized.ok, true);
  assert.equal(minimized.response.citationCatalog['wardrobe-v7'].version, 7);
  for (const forbidden of [
    'Should I buy these shoes?',
    'confirmedOwnedItemIds',
    'privatePrompt',
    'facts',
    'corrections',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('invalidation removes private prompt and evidence and blocks answers', () => {
  const original = request().request;
  const result = invalidateStylistRequest(original, {
    nowIso: '2026-07-26T04:00:00.000Z',
  });
  assert.equal(result.ok, true);
  assert.equal(result.request.status, 'invalidated');
  assert.equal(result.request.privatePrompt, null);
  assert.deepEqual(result.request.evidence, []);
  assert.equal(
    validateAndBuildStylistResponse(result.request, groundedDraft()).error,
    'active-stylist-request-required',
  );
  assert.equal(original.evidence.length, 3);
});
