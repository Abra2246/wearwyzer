import { stableSerialize } from './ai-stylist-evaluator.mjs';

export const DAILY_STYLIST_PRODUCTION_READINESS_GATE_VERSION = 'daily-stylist-production-readiness-gate-v1';

// The ten production decisions Issue #168 recorded as unresolved
// (docs/DAILY_STYLIST_WEB_TRANSPORT_BOUNDARY_V1.md, "Production decision
// packet"). This is the closed, exhaustive set — exactly these areas, no
// more, no fewer, each required exactly once. The array order is also the
// canonical output order: decisions are re-sorted into this order
// regardless of submission order so byte-stable output never depends on how
// the caller ordered its evidence.
export const DECISION_AREAS = Object.freeze([
  'auth-session-provider',
  'session-cookie-architecture',
  'hosting',
  'storage',
  'retention',
  'privacy-legal-review',
  'monitoring',
  'rate-limiting',
  'abuse-prevention',
  'incident-response',
]);
const DECISION_AREA_SET = new Set(DECISION_AREAS);
const DECISION_AREA_INDEX = new Map(DECISION_AREAS.map((area, index) => [area, index]));

export const DECISION_STATUSES = Object.freeze(['missing', 'proposed', 'rejected', 'expired', 'approved']);
const DECISION_STATUS_SET = new Set(DECISION_STATUSES);

export const APPROVAL_CLASSES = Object.freeze(['engineering', 'founder', 'privacy-legal']);
const APPROVAL_CLASS_SET = new Set(APPROVAL_CLASSES);

// Fixed, closed mapping from decision area to the one approval class that
// may close it. This is never read from the submitted evidence and cannot be
// widened or narrowed by input — a decision approved by any other class is
// evaluated as `wrong-approver-class`, never inferred as sufficient.
// `retention` and `privacy-legal-review` require `privacy-legal` because
// both govern the handling of real personal data. `auth-session-provider`,
// `hosting`, `storage`, `monitoring`, and `abuse-prevention` require
// `founder` because each selects an external provider and commits spend or
// credentials. `session-cookie-architecture`, `rate-limiting`, and
// `incident-response` are internal engineering policy with no vendor,
// spend, or personal-data-handling choice of their own.
export const REQUIRED_APPROVAL_CLASS = Object.freeze({
  'auth-session-provider': 'founder',
  'session-cookie-architecture': 'engineering',
  hosting: 'founder',
  storage: 'founder',
  retention: 'privacy-legal',
  'privacy-legal-review': 'privacy-legal',
  monitoring: 'founder',
  'rate-limiting': 'engineering',
  'abuse-prevention': 'founder',
  'incident-response': 'engineering',
});

// Evidence older than this, even if cleanly approved by the correct class,
// is treated as stale and never contributes to `ready-for-implementation-review`.
export const EVIDENCE_MAX_AGE_DAYS = 180;

const DECISION_ENVELOPE_KEYS = new Set(['schemaVersion', 'requestedAtIso', 'decisions']);
const DECISION_RECORD_KEYS = new Set([
  'decisionArea',
  'status',
  'evidenceRef',
  'approverClass',
  'approvedAtIso',
  'evidenceAtIso',
]);

const NEXT_STEP_BY_BLOCKER = Object.freeze({
  'decision-missing': 'submit-bounded-evidence-reference',
  'decision-proposed-not-approved': 'obtain-required-class-approval',
  'decision-rejected': 'resubmit-revised-evidence',
  'decision-expired': 'refresh-and-resubmit-evidence',
  'wrong-approver-class': 'obtain-approval-from-the-required-class',
  'decision-evidence-stale': 'refresh-approval-evidence',
});

// A fixed, always-present statement of what this gate never authorizes,
// regardless of aggregate status. `ready-for-implementation-review` means
// only that a future implementation design may be reviewed.
export const READINESS_GATE_AUTHORIZATION_SCOPE = Object.freeze({
  authorizesEndpoint: false,
  authorizesAccount: false,
  authorizesDatabase: false,
  authorizesMigration: false,
  authorizesCredential: false,
  authorizesRealPersonalRecord: false,
  authorizesDeployment: false,
  authorizesExternalAction: false,
  authorizesFutureImplementationReviewOnly: true,
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function isIso(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

// Evidence references are bounded, opaque identifiers only — never a URL,
// free text, or document body. This is what keeps raw legal text, provider
// payloads, contract terms, secrets, personal data, commercial rates, and
// private document content out of this gate's input and output: anything
// resembling them fails this pattern and the record is rejected.
function isBoundedEvidenceReference(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function daysOld(iso, nowIso) {
  return (new Date(nowIso).getTime() - new Date(iso).getTime()) / 86_400_000;
}

function validDecisionRecord(record) {
  if (!exactKeys(record, DECISION_RECORD_KEYS)) return false;
  if (!DECISION_AREA_SET.has(record.decisionArea)) return false;
  if (!DECISION_STATUS_SET.has(record.status)) return false;

  if (record.status === 'missing') {
    if (record.evidenceRef !== null || record.evidenceAtIso !== null) return false;
  } else {
    if (!isBoundedEvidenceReference(record.evidenceRef)) return false;
    if (!isIso(record.evidenceAtIso)) return false;
  }

  if (record.status === 'approved') {
    if (!APPROVAL_CLASS_SET.has(record.approverClass)) return false;
    if (!isIso(record.approvedAtIso)) return false;
  } else {
    if (record.approverClass !== null || record.approvedAtIso !== null) return false;
  }

  return true;
}

// Validates the closed envelope shape only: exact top-level keys, exactly
// one record per required decision area (no duplicate, no unknown area, no
// missing area), and every record individually well-formed. This is the
// fail-closed structural gate — unknown fields, duplicate areas, unbounded
// evidence references, and status/evidence/approval combinations that
// contradict each other never reach the evaluation below.
function validateDecisionEnvelope(input) {
  if (
    !exactKeys(input, DECISION_ENVELOPE_KEYS)
    || input.schemaVersion !== DAILY_STYLIST_PRODUCTION_READINESS_GATE_VERSION
    || !isIso(input.requestedAtIso)
    || !Array.isArray(input.decisions)
    || input.decisions.length !== DECISION_AREAS.length
  ) {
    return { ok: false, error: 'closed-readiness-gate-envelope-required' };
  }

  const seenAreas = new Set();
  for (const record of input.decisions) {
    if (!validDecisionRecord(record)) {
      return { ok: false, error: 'closed-readiness-gate-envelope-required' };
    }
    if (seenAreas.has(record.decisionArea)) {
      return { ok: false, error: 'duplicate-decision-area' };
    }
    seenAreas.add(record.decisionArea);
  }
  if (seenAreas.size !== DECISION_AREAS.length) {
    return { ok: false, error: 'closed-readiness-gate-envelope-required' };
  }

  return { ok: true };
}

function evaluateDecision(record, nowIso) {
  const requiredApprovalClass = REQUIRED_APPROVAL_CLASS[record.decisionArea];
  const blockers = [];

  if (record.status === 'missing') blockers.push('decision-missing');
  else if (record.status === 'proposed') blockers.push('decision-proposed-not-approved');
  else if (record.status === 'rejected') blockers.push('decision-rejected');
  else if (record.status === 'expired') blockers.push('decision-expired');
  else if (record.approverClass !== requiredApprovalClass) blockers.push('wrong-approver-class');

  let freshness = 'not-applicable';
  if (record.status === 'approved' && blockers.length === 0) {
    freshness = daysOld(record.approvedAtIso, nowIso) <= EVIDENCE_MAX_AGE_DAYS ? 'fresh' : 'stale';
    if (freshness === 'stale') blockers.push('decision-evidence-stale');
  }

  return {
    decisionArea: record.decisionArea,
    status: record.status,
    approvalClass: requiredApprovalClass,
    evidenceRef: record.evidenceRef,
    freshness,
    blockers,
    nextStep: blockers.length === 0 ? null : NEXT_STEP_BY_BLOCKER[blockers[0]],
  };
}

// Evaluates one closed `daily-stylist-production-readiness-gate-v1` decision
// packet. This never selects a vendor, processes real data, or authorizes
// deployment — see `READINESS_GATE_AUTHORIZATION_SCOPE`. It only turns
// submitted, minimized decision evidence into one deterministic aggregate
// status plus a per-decision breakdown.
export function evaluateDailyStylistProductionReadiness(input) {
  const validation = validateDecisionEnvelope(input);
  if (!validation.ok) return validation;

  const decisions = [...input.decisions]
    .sort((a, b) => DECISION_AREA_INDEX.get(a.decisionArea) - DECISION_AREA_INDEX.get(b.decisionArea))
    .map((record) => evaluateDecision(record, input.requestedAtIso));

  const blockedByFounder = decisions.some((decision) =>
    decision.approvalClass === 'founder' && decision.blockers.length > 0
  );
  const blockedByPrivacyLegal = decisions.some((decision) =>
    decision.approvalClass === 'privacy-legal' && decision.blockers.length > 0
  );
  const blockedByEngineering = decisions.some((decision) =>
    decision.approvalClass === 'engineering' && decision.blockers.length > 0
  );

  let status;
  if (blockedByFounder || blockedByPrivacyLegal) status = 'not-ready';
  else if (blockedByEngineering) status = 'review-required';
  else status = 'ready-for-implementation-review';

  const safeNextStep = status === 'ready-for-implementation-review'
    ? 'route-to-implementation-design-review'
    : decisions.find((decision) => decision.blockers.length > 0).nextStep;

  return {
    ok: true,
    result: {
      schemaVersion: DAILY_STYLIST_PRODUCTION_READINESS_GATE_VERSION,
      requestedAtIso: input.requestedAtIso,
      status,
      decisions,
      blockedByFounder,
      blockedByPrivacyLegal,
      safeNextStep,
      authorizationScope: READINESS_GATE_AUTHORIZATION_SCOPE,
    },
  };
}

export function serializeDailyStylistProductionReadinessPacket(packet) {
  return stableSerialize(packet);
}

function missingDecisionRecord(decisionArea) {
  return Object.freeze({
    decisionArea,
    status: 'missing',
    evidenceRef: null,
    approverClass: null,
    approvedAtIso: null,
    evidenceAtIso: null,
  });
}

// The actual, current state of every Daily Stylist production decision: none
// of the ten has been decided. This is not a fixture standing in for a
// future real state — it is what Issue #168 recorded and what remains true
// until a human closes each decision. Running the gate on this input is the
// closed-loop proof that the objective (turn the ten unresolved decisions
// into one deterministic gate) is met: it must evaluate to `not-ready`.
export const CURRENT_DAILY_STYLIST_PRODUCTION_DECISIONS = Object.freeze({
  schemaVersion: DAILY_STYLIST_PRODUCTION_READINESS_GATE_VERSION,
  requestedAtIso: '2026-07-26T00:00:00.000Z',
  decisions: Object.freeze(DECISION_AREAS.map((area) => missingDecisionRecord(area))),
});

export function evaluateCurrentDailyStylistProductionReadiness() {
  return evaluateDailyStylistProductionReadiness(CURRENT_DAILY_STYLIST_PRODUCTION_DECISIONS);
}
