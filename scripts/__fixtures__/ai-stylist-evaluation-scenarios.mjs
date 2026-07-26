import { STYLIST_INTENTS } from '../ai-stylist-contract.mjs';

const NOW = '2026-07-26T05:00:00.000Z';

function acceptedEvidence() {
  return [
    {
      evidenceId: 'profile-v2',
      type: 'profile',
      version: 2,
      state: 'accepted',
      facts: {
        styleTags: ['minimal', 'smart-casual'],
        preferredFitTags: ['relaxed'],
        avoidedBrandIds: [],
        budgetBand: 'mid',
      },
      verifiedAtIso: NOW,
    },
    {
      evidenceId: 'wardrobe-v7',
      type: 'wardrobe-snapshot',
      version: 7,
      state: 'accepted',
      facts: {
        confirmedOwnedItemIds: ['shoe-1', 'trouser-1', 'polo-1'],
        snapshotItemCount: 3,
      },
      verifiedAtIso: NOW,
    },
    {
      evidenceId: 'product-v3',
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
    {
      evidenceId: 'outfit-plan-v1',
      type: 'outfit-plan',
      version: 1,
      state: 'accepted',
      facts: {
        planId: 'fixture-plan-1',
        status: 'complete',
        confidence: 0.92,
        usedItemIds: ['shoe-1', 'trouser-1', 'polo-1'],
        gapCategories: [],
      },
      verifiedAtIso: NOW,
    },
  ];
}

function positiveScenario(intent, index) {
  const ownedSubject = intent === 'style-owned-item'
    ? { kind: 'owned-item', itemId: 'shoe-1' }
    : { kind: 'product', productId: 'adidas-samba-og-b75806' };
  return {
    scenarioId: `positive-${intent}`,
    scenarioClass: 'positive',
    nowIso: NOW,
    expectedOutcome: 'answer',
    forbiddenOutputTokens: [`private prompt ${index}`, 'confirmedOwnedItemIds', 'styleTags'],
    requestInput: {
      requestId: `fixture-request-${index}`,
      intent,
      promptCategory: intent,
      privatePrompt: `private prompt ${index}`,
      evidence: acceptedEvidence(),
    },
    draft: {
      claims: [
        {
          claimId: `claim-${intent}`,
          claimType: 'editorial-guidance',
          text: `Grounded guidance for ${intent}.`,
          subject: ownedSubject,
          citations: intent === 'plan-occasion'
            ? ['outfit-plan-v1', 'wardrobe-v7']
            : ['profile-v2', 'wardrobe-v7', 'product-v3', 'evaluation-v1'],
          confidence: 0.9,
          opposingEvidence: ['Fixture limitations remain visible'],
        },
      ],
      opposingEvidence: ['No live provider or external data used'],
      nextStep: 'Review the cited fixture evidence',
    },
  };
}

export const POSITIVE_STYLIST_SCENARIOS = Object.freeze(
  STYLIST_INTENTS.map(positiveScenario),
);

function adversarialScenario({
  scenarioId,
  intent = 'evaluate-purchase',
  expectedOutcome,
  expectedError,
  mutateRequest,
  mutateDraft,
}) {
  const base = positiveScenario(intent, `adversarial-${scenarioId}`);
  base.scenarioId = scenarioId;
  base.scenarioClass = 'adversarial';
  base.expectedOutcome = expectedOutcome;
  base.expectedError = expectedError;
  if (mutateRequest) mutateRequest(base.requestInput);
  if (mutateDraft) mutateDraft(base.draft);
  return base;
}

export const ADVERSARIAL_STYLIST_SCENARIOS = Object.freeze([
  adversarialScenario({
    scenarioId: 'adversarial-missing-citation',
    expectedOutcome: 'response-error',
    expectedError: 'material-claim-citation-required',
    mutateDraft: (draft) => { draft.claims[0].citations = []; },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-unowned-item',
    intent: 'style-owned-item',
    expectedOutcome: 'response-error',
    expectedError: 'unowned-item-claim',
    mutateDraft: (draft) => { draft.claims[0].subject.itemId = 'not-owned'; },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-invented-price',
    expectedOutcome: 'response-error',
    expectedError: 'fact-not-grounded',
    mutateDraft: (draft) => {
      draft.claims[0].claimType = 'fact';
      draft.claims[0].factKey = 'priceUsd';
      draft.claims[0].factValue = 99;
      draft.claims[0].citations = ['product-v3'];
    },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-stale-source',
    expectedOutcome: 'abstain',
    mutateRequest: (request) => {
      request.evidence.find((record) => record.evidenceId === 'product-v3').state = 'stale';
    },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-ambiguous-source',
    expectedOutcome: 'abstain',
    mutateRequest: (request) => {
      request.evidence.find((record) => record.evidenceId === 'product-v3').state = 'ambiguous';
    },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-conflicting-source',
    expectedOutcome: 'abstain',
    mutateRequest: (request) => {
      request.evidence.find((record) => record.evidenceId === 'product-v3').state = 'conflicting';
    },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-private-field',
    expectedOutcome: 'request-error',
    expectedError: 'evidence-fact-not-allowlisted',
    mutateRequest: (request) => {
      request.evidence[0].facts.privateMeasurement = 'secret';
    },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-external-action',
    expectedOutcome: 'request-error',
    expectedError: 'supported-request-and-intent-required',
    mutateRequest: (request) => { request.intent = 'purchase-for-me'; },
  }),
  adversarialScenario({
    scenarioId: 'adversarial-insufficient-evidence',
    expectedOutcome: 'abstain',
    mutateDraft: (draft) => { draft.claims = []; },
  }),
]);

export const ALL_STYLIST_EVALUATION_SCENARIOS = Object.freeze([
  ...POSITIVE_STYLIST_SCENARIOS,
  ...ADVERSARIAL_STYLIST_SCENARIOS,
]);
