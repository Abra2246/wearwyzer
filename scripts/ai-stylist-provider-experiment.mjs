import {
  ALL_STYLIST_EVALUATION_SCENARIOS,
} from './__fixtures__/ai-stylist-evaluation-scenarios.mjs';
import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const PROVIDER_EXPERIMENT_VERSION = 'ai-stylist-provider-experiment-v1';
export const PROVIDER_EXPERIMENT_EVIDENCE_VERSION = 'ai-stylist-provider-evidence-v1';
export const PROVIDER_DECISION_PACKET_VERSION = 'ai-stylist-provider-decision-v1';

const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'experimentId',
  'fixtureVersion',
  'scenarioCount',
  'candidateIds',
  'limits',
  'authorization',
]);
const LIMIT_KEYS = new Set([
  'maxRequests',
  'maxUsdCents',
  'maxRetriesPerScenario',
  'timeoutSeconds',
]);
const AUTHORIZATION_KEYS = new Set([
  'externalProcessingApproved',
  'credentialUseApproved',
  'spendApproved',
  'approvalReference',
]);
const EVIDENCE_KEYS = new Set([
  'schemaVersion',
  'experimentId',
  'authorization',
  'observed',
  'candidates',
  'stopReasons',
]);
const OBSERVED_KEYS = new Set([
  'requestCount',
  'usdSpentCents',
  'provenanceComplete',
  'spendComplete',
  'outputsComplete',
]);
const CANDIDATE_KEYS = new Set(['candidateId', 'trustPassed', 'editorialStatus']);
const EDITORIAL_STATUSES = new Set([
  'not-evaluated',
  'selected',
  'tie',
  'review-required',
  'not-selected',
]);
const SENSITIVE_KEYS = new Set([
  'apiKey',
  'credential',
  'model',
  'provider',
  'prompt',
  'draft',
  'profile',
  'wardrobe',
  'request',
  'response',
  'token',
]);

function closedObject(value, allowedKeys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowedKeys.has(key));
}

function containsSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) => SENSITIVE_KEYS.has(key) || containsSensitiveKey(child),
  );
}

function validCandidateId(value) {
  return /^candidate-[a-z0-9][a-z0-9-]{1,47}$/.test(value ?? '');
}

export function validateProviderExperimentManifest(manifest) {
  if (!closedObject(manifest, MANIFEST_KEYS)) {
    return { ok: false, error: 'experiment-manifest-closed-schema-required' };
  }
  if (containsSensitiveKey(manifest)) {
    return { ok: false, error: 'private-experiment-configuration-rejected' };
  }
  if (manifest.schemaVersion !== PROVIDER_EXPERIMENT_VERSION) {
    return { ok: false, error: 'unsupported-experiment-version' };
  }
  if (!/^stylist-experiment-[a-z0-9-]{3,48}$/.test(manifest.experimentId ?? '')) {
    return { ok: false, error: 'valid-experiment-id-required' };
  }
  if (manifest.fixtureVersion !== 1
    || manifest.scenarioCount !== ALL_STYLIST_EVALUATION_SCENARIOS.length) {
    return { ok: false, error: 'accepted-synthetic-corpus-required' };
  }
  if (!Array.isArray(manifest.candidateIds)
    || manifest.candidateIds.length < 1
    || manifest.candidateIds.length > 3
    || manifest.candidateIds.some((candidateId) => !validCandidateId(candidateId))
    || new Set(manifest.candidateIds).size !== manifest.candidateIds.length) {
    return { ok: false, error: 'one-to-three-opaque-candidates-required' };
  }
  if (!closedObject(manifest.limits, LIMIT_KEYS)
    || !Number.isInteger(manifest.limits.maxRequests)
    || manifest.limits.maxRequests < manifest.scenarioCount * manifest.candidateIds.length
    || manifest.limits.maxRequests > 90
    || !Number.isInteger(manifest.limits.maxUsdCents)
    || manifest.limits.maxUsdCents < 1
    || manifest.limits.maxUsdCents > 100
    || !Number.isInteger(manifest.limits.maxRetriesPerScenario)
    || manifest.limits.maxRetriesPerScenario < 0
    || manifest.limits.maxRetriesPerScenario > 1
    || !Number.isInteger(manifest.limits.timeoutSeconds)
    || manifest.limits.timeoutSeconds < 10
    || manifest.limits.timeoutSeconds > 300) {
    return { ok: false, error: 'bounded-experiment-limits-required' };
  }
  if (!closedObject(manifest.authorization, AUTHORIZATION_KEYS)
    || manifest.authorization.externalProcessingApproved !== false
    || manifest.authorization.credentialUseApproved !== false
    || manifest.authorization.spendApproved !== false
    || manifest.authorization.approvalReference !== null) {
    return { ok: false, error: 'zero-default-authorization-required' };
  }
  return { ok: true };
}

function validateAuthorization(authorization) {
  return closedObject(authorization, AUTHORIZATION_KEYS)
    && typeof authorization.externalProcessingApproved === 'boolean'
    && typeof authorization.credentialUseApproved === 'boolean'
    && typeof authorization.spendApproved === 'boolean'
    && (
      authorization.approvalReference === null
      || /^founder-approval-[a-z0-9-]{3,48}$/.test(authorization.approvalReference ?? '')
    );
}

function validateEvidence(manifest, evidence) {
  if (!closedObject(evidence, EVIDENCE_KEYS)) return 'experiment-evidence-closed-schema-required';
  if (containsSensitiveKey(evidence)) return 'private-experiment-evidence-rejected';
  if (evidence.schemaVersion !== PROVIDER_EXPERIMENT_EVIDENCE_VERSION) {
    return 'unsupported-experiment-evidence-version';
  }
  if (evidence.experimentId !== manifest.experimentId) return 'experiment-evidence-id-mismatch';
  if (!validateAuthorization(evidence.authorization)) return 'valid-founder-authorization-required';
  if (!closedObject(evidence.observed, OBSERVED_KEYS)
    || !Number.isInteger(evidence.observed.requestCount)
    || evidence.observed.requestCount < 0
    || !Number.isInteger(evidence.observed.usdSpentCents)
    || evidence.observed.usdSpentCents < 0
    || typeof evidence.observed.provenanceComplete !== 'boolean'
    || typeof evidence.observed.spendComplete !== 'boolean'
    || typeof evidence.observed.outputsComplete !== 'boolean') {
    return 'complete-observed-evidence-required';
  }
  if (!Array.isArray(evidence.candidates)
    || evidence.candidates.length !== manifest.candidateIds.length) {
    return 'complete-candidate-evidence-required';
  }
  const candidateIds = evidence.candidates.map((candidate) => candidate?.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length
    || manifest.candidateIds.some((candidateId) => !candidateIds.includes(candidateId))) {
    return 'candidate-evidence-set-mismatch';
  }
  for (const candidate of evidence.candidates) {
    if (!closedObject(candidate, CANDIDATE_KEYS)
      || typeof candidate.trustPassed !== 'boolean'
      || !EDITORIAL_STATUSES.has(candidate.editorialStatus)) {
      return 'valid-candidate-gate-evidence-required';
    }
    if (!candidate.trustPassed && candidate.editorialStatus !== 'not-evaluated') {
      return 'trust-must-precede-editorial-review';
    }
  }
  if (!Array.isArray(evidence.stopReasons)
    || evidence.stopReasons.some(
      (reason) => typeof reason !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(reason),
    )) {
    return 'valid-stop-reasons-required';
  }
  return null;
}

export function buildProviderDecisionPacket(manifest, evidence) {
  const manifestResult = validateProviderExperimentManifest(manifest);
  if (!manifestResult.ok) return manifestResult;
  const evidenceError = validateEvidence(manifest, evidence);
  if (evidenceError) return { ok: false, error: evidenceError };

  const authorizationComplete = evidence.authorization.externalProcessingApproved
    && evidence.authorization.credentialUseApproved
    && evidence.authorization.spendApproved
    && evidence.authorization.approvalReference !== null;
  const evidenceComplete = evidence.observed.provenanceComplete
    && evidence.observed.spendComplete
    && evidence.observed.outputsComplete;
  const limitExceeded = evidence.observed.requestCount > manifest.limits.maxRequests
    || evidence.observed.usdSpentCents > manifest.limits.maxUsdCents;
  const trustFailed = evidence.candidates.some((candidate) => !candidate.trustPassed);
  const editorialNeedsReview = evidence.candidates.some(
    (candidate) => candidate.editorialStatus === 'tie'
      || candidate.editorialStatus === 'review-required',
  );

  let status = 'complete';
  const stopReasons = [...evidence.stopReasons];
  if (!authorizationComplete) status = 'not-authorized';
  else if (!evidenceComplete) status = 'incomplete';
  else if (limitExceeded) {
    status = 'stopped';
    stopReasons.push('declared-limit-exceeded');
  } else if (evidence.stopReasons.length > 0) status = 'stopped';
  else if (trustFailed) {
    status = 'stopped-before-editorial';
    stopReasons.push('trust-gate-failed');
  } else if (editorialNeedsReview) status = 'review-required';

  return {
    ok: true,
    packet: {
      schemaVersion: PROVIDER_DECISION_PACKET_VERSION,
      experimentId: manifest.experimentId,
      fixtureVersion: manifest.fixtureVersion,
      scenarioCount: manifest.scenarioCount,
      candidateIds: [...manifest.candidateIds].sort(),
      limits: { ...manifest.limits },
      observed: { ...evidence.observed },
      candidates: evidence.candidates
        .map((candidate) => ({ ...candidate }))
        .sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
      authorization: { ...evidence.authorization },
      decision: {
        status,
        stopReasons: [...new Set(stopReasons)].sort(),
      },
    },
  };
}

export function createFixtureExperimentManifest({
  experimentId = 'stylist-experiment-fixture',
  candidateIds = ['candidate-alpha', 'candidate-beta'],
} = {}) {
  return {
    schemaVersion: PROVIDER_EXPERIMENT_VERSION,
    experimentId,
    fixtureVersion: 1,
    scenarioCount: ALL_STYLIST_EVALUATION_SCENARIOS.length,
    candidateIds: [...candidateIds],
    limits: {
      maxRequests: ALL_STYLIST_EVALUATION_SCENARIOS.length * candidateIds.length,
      maxUsdCents: 30,
      maxRetriesPerScenario: 0,
      timeoutSeconds: 120,
    },
    authorization: {
      externalProcessingApproved: false,
      credentialUseApproved: false,
      spendApproved: false,
      approvalReference: null,
    },
  };
}

export function serializeProviderDecisionPacket(packet) {
  return stableSerialize(packet);
}
