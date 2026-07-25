import { products as canonicalProducts } from '../data/products.js';
import { offers as canonicalOffers } from '../data/offers.js';
import { products as productFacts } from '../js/products.js';
import {
  evaluatePurchase,
  RECOMMENDATIONS,
  SCORING_VERSION,
} from './personalization-engine.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
  FIXTURE_WARDROBE_SNAPSHOT_ID,
} from './__fixtures__/personalization.mjs';

export const PERSONALIZATION_REQUEST_VERSION = 'personalization-request-v1';
export const PERSONALIZATION_RESPONSE_VERSION = 'personalization-response-v1';
export const PRODUCT_MATCH_STATES = Object.freeze(['exact', 'similar', 'unknown']);
export const MAX_PRODUCT_SOURCE_AGE_DAYS = 30;

const REQUEST_KEYS = new Set([
  'schemaVersion',
  'requestId',
  'scoringVersion',
  'subject',
  'candidate',
  'consent',
  'requestedAtIso',
]);
const SUBJECT_KEYS = new Set(['profileId', 'wardrobeSnapshotId']);
const CANDIDATE_KEYS = new Set(['productId', 'matchState', 'matchConfidence']);
const CONSENT_KEYS = new Set(['personalization']);
const RESPONSE_KEYS = new Set([
  'schemaVersion',
  'requestId',
  'scoringVersion',
  'status',
  'error',
  'subjectRefs',
  'candidate',
  'recommendation',
  'confidence',
  'reasonCodes',
  'evidence',
  'scores',
  'outfits',
  'freshness',
]);
const SUBJECT_REF_KEYS = new Set(['profileId', 'wardrobeSnapshotId']);
const RESPONSE_CANDIDATE_KEYS = new Set([
  'productId',
  'name',
  'matchState',
  'matchConfidence',
  'sourceUrl',
  'availabilityStatus',
  'price',
  'priceStatus',
]);
const EVIDENCE_KEYS = new Set(['supporting', 'opposing']);
const SCORES_KEYS = new Set([
  'compatibility',
  'versatility',
  'gapCoverage',
  'redundancy',
  'outfitUnlocks',
  'purchaseRoi',
]);
const FRESHNESS_KEYS = new Set(['productSourceVerifiedAt', 'evaluatedAtIso', 'maxSourceAgeDays']);
const OUTFIT_KEYS = new Set(['id', 'score', 'reasonCodes', 'items']);
const OUTFIT_ITEM_KEYS = new Set(['productId', 'state']);
const ITEM_STATES = new Set(['owned', 'prospective', 'missing']);
const PRIVATE_KEY_PATTERNS = [
  /^profile$/i,
  /^wardrobe$/i,
  /preferredcolors/i,
  /favoritebrands/i,
  /avoidedbrands/i,
  /fitpreferences/i,
  /categorybudgets/i,
  /wearcount/i,
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unknownKeys(value, allowed, path, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}: unknown key "${key}"`);
  }
}

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function pushRequiredString(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${path}: required non-empty string`);
}

function validateMatch(candidate, errors) {
  if (!isObject(candidate)) {
    errors.push('candidate: required object');
    return;
  }
  unknownKeys(candidate, CANDIDATE_KEYS, 'candidate', errors);
  pushRequiredString(candidate.productId, 'candidate.productId', errors);
  if (!PRODUCT_MATCH_STATES.includes(candidate.matchState)) {
    errors.push('candidate.matchState: expected exact, similar, or unknown');
  }
  if (
    typeof candidate.matchConfidence !== 'number'
    || candidate.matchConfidence < 0
    || candidate.matchConfidence > 1
  ) {
    errors.push('candidate.matchConfidence: expected number between 0 and 1');
  }
  if (candidate.matchState === 'exact' && candidate.matchConfidence < 0.95) {
    errors.push('candidate.matchConfidence: exact matches require confidence >= 0.95');
  }
  if (candidate.matchState === 'unknown' && candidate.matchConfidence !== 0) {
    errors.push('candidate.matchConfidence: unknown matches require confidence 0');
  }
}

export function validatePersonalizationRequest(request) {
  const errors = [];
  if (!isObject(request)) return { valid: false, errors: ['request: required object'] };
  unknownKeys(request, REQUEST_KEYS, 'request', errors);
  if (request.schemaVersion !== PERSONALIZATION_REQUEST_VERSION) {
    errors.push(`schemaVersion: expected ${PERSONALIZATION_REQUEST_VERSION}`);
  }
  if (request.scoringVersion !== SCORING_VERSION) {
    errors.push(`scoringVersion: unsupported version "${request.scoringVersion}"`);
  }
  pushRequiredString(request.requestId, 'requestId', errors);
  if (!validIso(request.requestedAtIso)) errors.push('requestedAtIso: expected ISO timestamp');

  if (!isObject(request.subject)) {
    errors.push('subject: required object');
  } else {
    unknownKeys(request.subject, SUBJECT_KEYS, 'subject', errors);
    pushRequiredString(request.subject.profileId, 'subject.profileId', errors);
    pushRequiredString(request.subject.wardrobeSnapshotId, 'subject.wardrobeSnapshotId', errors);
  }
  validateMatch(request.candidate, errors);

  if (!isObject(request.consent)) {
    errors.push('consent: required object');
  } else {
    unknownKeys(request.consent, CONSENT_KEYS, 'consent', errors);
    if (request.consent.personalization !== true) {
      errors.push('consent.personalization: explicit true is required');
    }
  }
  return { valid: errors.length === 0, errors };
}

function scoreShapeValid(scores, errors) {
  if (!isObject(scores)) {
    errors.push('scores: required object');
    return;
  }
  unknownKeys(scores, SCORES_KEYS, 'scores', errors);
  for (const key of SCORES_KEYS) {
    if (!(key in scores)) errors.push(`scores.${key}: required`);
  }
}

export function validatePersonalizationResponse(response) {
  const errors = [];
  if (!isObject(response)) return { valid: false, errors: ['response: required object'] };
  unknownKeys(response, RESPONSE_KEYS, 'response', errors);
  if (response.schemaVersion !== PERSONALIZATION_RESPONSE_VERSION) {
    errors.push(`schemaVersion: expected ${PERSONALIZATION_RESPONSE_VERSION}`);
  }
  pushRequiredString(response.requestId, 'requestId', errors);
  if (!['ok', 'error'].includes(response.status)) errors.push('status: expected ok or error');
  if (response.status === 'error') {
    pushRequiredString(response.error, 'error', errors);
    return { valid: errors.length === 0, errors };
  }
  if (response.error !== null) errors.push('error: successful responses require null');
  if (response.scoringVersion !== SCORING_VERSION) errors.push('scoringVersion: unsupported');
  if (!isObject(response.subjectRefs)) errors.push('subjectRefs: required object');
  else unknownKeys(response.subjectRefs, SUBJECT_REF_KEYS, 'subjectRefs', errors);
  if (!isObject(response.candidate)) errors.push('candidate: required object');
  else unknownKeys(response.candidate, RESPONSE_CANDIDATE_KEYS, 'candidate', errors);
  if (!RECOMMENDATIONS.includes(response.recommendation)) {
    errors.push('recommendation: unsupported outcome');
  }
  if (!['low', 'medium', 'high'].includes(response.confidence)) {
    errors.push('confidence: expected low, medium, or high');
  }
  if (!Array.isArray(response.reasonCodes)) errors.push('reasonCodes: expected array');
  if (!isObject(response.evidence)) errors.push('evidence: required object');
  else unknownKeys(response.evidence, EVIDENCE_KEYS, 'evidence', errors);
  scoreShapeValid(response.scores, errors);
  if (!Array.isArray(response.outfits)) {
    errors.push('outfits: expected array');
  } else {
    response.outfits.forEach((outfit, index) => {
      unknownKeys(outfit, OUTFIT_KEYS, `outfits[${index}]`, errors);
      if (!Array.isArray(outfit.items)) errors.push(`outfits[${index}].items: expected array`);
      else outfit.items.forEach((item, itemIndex) => {
        unknownKeys(item, OUTFIT_ITEM_KEYS, `outfits[${index}].items[${itemIndex}]`, errors);
        if (!ITEM_STATES.has(item.state)) {
          errors.push(`outfits[${index}].items[${itemIndex}].state: unsupported`);
        }
      });
    });
  }
  if (!isObject(response.freshness)) errors.push('freshness: required object');
  else {
    unknownKeys(response.freshness, FRESHNESS_KEYS, 'freshness', errors);
    if (!validIso(response.freshness.productSourceVerifiedAt)) {
      errors.push('freshness.productSourceVerifiedAt: expected ISO timestamp');
    }
    if (!validIso(response.freshness.evaluatedAtIso)) {
      errors.push('freshness.evaluatedAtIso: expected ISO timestamp');
    }
  }
  errors.push(...findPrivatePayloadKeys(response));
  return { valid: errors.length === 0, errors };
}

export function findPrivatePayloadKeys(value, path = 'response') {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...findPrivatePayloadKeys(entry, `${path}[${index}]`)));
    return findings;
  }
  if (!isObject(value)) return findings;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      findings.push(`${path}: private key "${key}" is not permitted`);
    }
    findings.push(...findPrivatePayloadKeys(child, `${path}.${key}`));
  }
  return findings;
}

function errorResponse(requestId, error) {
  return {
    schemaVersion: PERSONALIZATION_RESPONSE_VERSION,
    requestId: typeof requestId === 'string' && requestId ? requestId : 'invalid-request',
    scoringVersion: null,
    status: 'error',
    error,
    subjectRefs: null,
    candidate: null,
    recommendation: null,
    confidence: null,
    reasonCodes: [],
    evidence: null,
    scores: null,
    outfits: [],
    freshness: null,
  };
}

function sourceAgeDays(sourceVerifiedAt, nowIso) {
  const ageMs = new Date(nowIso).getTime() - new Date(sourceVerifiedAt).getTime();
  return ageMs / 86_400_000;
}

function responseFromEvaluation(request, evaluation, nowIso) {
  const ownedIds = new Set(evaluation.wardrobeSnapshot.productIds);
  return {
    schemaVersion: PERSONALIZATION_RESPONSE_VERSION,
    requestId: request.requestId,
    scoringVersion: evaluation.scoringVersion,
    status: 'ok',
    error: null,
    subjectRefs: { ...request.subject },
    candidate: {
      productId: evaluation.candidate.productId,
      name: evaluation.candidate.name,
      matchState: request.candidate.matchState,
      matchConfidence: request.candidate.matchConfidence,
      sourceUrl: evaluation.candidate.sourceUrl,
      availabilityStatus: evaluation.candidate.availabilityStatus,
      price: evaluation.candidate.price,
      priceStatus: evaluation.candidate.priceStatus,
    },
    recommendation: evaluation.recommendation,
    confidence: evaluation.confidence,
    reasonCodes: [...evaluation.reasonCodes],
    evidence: {
      supporting: [...evaluation.supportingEvidence],
      opposing: [...evaluation.opposingEvidence],
    },
    scores: structuredClone(evaluation.scores),
    outfits: evaluation.outfits.map((outfit) => ({
      id: outfit.id,
      score: outfit.score,
      reasonCodes: [...outfit.reasonCodes],
      items: outfit.itemIds.map((productId) => ({
        productId,
        state: productId === request.candidate.productId
          ? 'prospective'
          : ownedIds.has(productId) ? 'owned' : 'missing',
      })),
    })),
    freshness: {
      productSourceVerifiedAt: evaluation.candidate.sourceVerifiedAt,
      evaluatedAtIso: nowIso,
      maxSourceAgeDays: MAX_PRODUCT_SOURCE_AGE_DAYS,
    },
  };
}

export function createFixturePersonalizationContext({
  catalog = canonicalProducts,
  offers = canonicalOffers,
  facts = productFacts,
} = {}) {
  return {
    profiles: new Map([[FIXTURE_PROFILE.id, FIXTURE_PROFILE]]),
    wardrobeSnapshots: new Map([[
      FIXTURE_WARDROBE_SNAPSHOT_ID,
      { id: FIXTURE_WARDROBE_SNAPSHOT_ID, items: FIXTURE_WARDROBE },
    ]]),
    catalog,
    offers,
    facts,
  };
}

export function evaluatePersonalizationRequest(
  request,
  context = createFixturePersonalizationContext(),
  { nowIso = new Date().toISOString() } = {},
) {
  const requestValidation = validatePersonalizationRequest(request);
  if (!requestValidation.valid) {
    return errorResponse(request?.requestId, requestValidation.errors[0]);
  }
  if (request.candidate.matchState === 'unknown') {
    return errorResponse(request.requestId, 'unknown-product-match');
  }
  if (request.candidate.matchState === 'similar' && request.candidate.matchConfidence < 0.8) {
    return errorResponse(request.requestId, 'ambiguous-product-match');
  }

  const profile = context.profiles.get(request.subject.profileId);
  const wardrobe = context.wardrobeSnapshots.get(request.subject.wardrobeSnapshotId);
  if (!profile) return errorResponse(request.requestId, 'profile-not-found');
  if (!wardrobe) return errorResponse(request.requestId, 'wardrobe-snapshot-not-found');

  const fact = context.facts.find((entry) => entry.id === request.candidate.productId);
  if (!fact) return errorResponse(request.requestId, 'canonical-product-not-found');
  if (
    !validIso(fact.sourceVerifiedAt)
    || sourceAgeDays(fact.sourceVerifiedAt, nowIso) > MAX_PRODUCT_SOURCE_AGE_DAYS
  ) {
    return errorResponse(request.requestId, 'stale-product-source');
  }

  const evaluation = evaluatePurchase({
    profile,
    wardrobe: wardrobe.items,
    candidateId: request.candidate.productId,
    catalog: context.catalog,
    offers: context.offers,
    facts: context.facts,
  });
  if (!evaluation.ok) return errorResponse(request.requestId, evaluation.error);

  const response = responseFromEvaluation(request, evaluation, nowIso);
  const responseValidation = validatePersonalizationResponse(response);
  if (!responseValidation.valid) {
    return errorResponse(request.requestId, `invalid-response:${responseValidation.errors[0]}`);
  }
  return response;
}
