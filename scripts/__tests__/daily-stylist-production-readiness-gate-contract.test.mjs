import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVAL_CLASSES,
  CURRENT_DAILY_STYLIST_PRODUCTION_DECISIONS,
  DAILY_STYLIST_PRODUCTION_READINESS_GATE_VERSION,
  DECISION_AREAS,
  DECISION_STATUSES,
  EVIDENCE_MAX_AGE_DAYS,
  READINESS_GATE_AUTHORIZATION_SCOPE,
  REQUIRED_APPROVAL_CLASS,
  evaluateCurrentDailyStylistProductionReadiness,
  evaluateDailyStylistProductionReadiness,
  serializeDailyStylistProductionReadinessPacket,
} from '../daily-stylist-production-readiness-gate-contract.mjs';

const NOW = '2026-07-26T12:00:00.000Z';

function approvedRecord(decisionArea, overrides = {}) {
  return {
    decisionArea,
    status: 'approved',
    evidenceRef: `evidence-${decisionArea}-01`,
    approverClass: REQUIRED_APPROVAL_CLASS[decisionArea],
    approvedAtIso: NOW,
    evidenceAtIso: NOW,
    ...overrides,
  };
}

function missingRecord(decisionArea) {
  return {
    decisionArea,
    status: 'missing',
    evidenceRef: null,
    approverClass: null,
    approvedAtIso: null,
    evidenceAtIso: null,
  };
}

function completeApprovedEnvelope(overrides = {}) {
  return {
    schemaVersion: DAILY_STYLIST_PRODUCTION_READINESS_GATE_VERSION,
    requestedAtIso: NOW,
    decisions: DECISION_AREAS.map((area) => approvedRecord(area)),
    ...overrides,
  };
}

function withDecision(envelope, decisionArea, record) {
  return {
    ...envelope,
    decisions: envelope.decisions.map((entry) => (entry.decisionArea === decisionArea ? record : entry)),
  };
}

test('a fully approved, fresh envelope is ready-for-implementation-review with zero blockers', () => {
  const evaluated = evaluateDailyStylistProductionReadiness(completeApprovedEnvelope());
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.result.status, 'ready-for-implementation-review');
  assert.equal(evaluated.result.blockedByFounder, false);
  assert.equal(evaluated.result.blockedByPrivacyLegal, false);
  assert.equal(evaluated.result.safeNextStep, 'route-to-implementation-design-review');
  for (const decision of evaluated.result.decisions) {
    assert.deepEqual(decision.blockers, []);
    assert.equal(decision.freshness, 'fresh');
  }
  assert.deepEqual(evaluated.result.decisions.map((d) => d.decisionArea), DECISION_AREAS);
});

test('the current, real Daily Stylist production decision state is not-ready', () => {
  const evaluated = evaluateCurrentDailyStylistProductionReadiness();
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.result.status, 'not-ready');
  assert.equal(evaluated.result.blockedByFounder, true);
  assert.equal(evaluated.result.blockedByPrivacyLegal, true);
  for (const decision of evaluated.result.decisions) {
    assert.equal(decision.status, 'missing');
    assert.deepEqual(decision.blockers, ['decision-missing']);
  }
  assert.deepEqual(
    CURRENT_DAILY_STYLIST_PRODUCTION_DECISIONS.decisions.map((d) => d.decisionArea),
    DECISION_AREAS,
  );
});

test('a missing founder-required decision blocks readiness as not-ready', () => {
  const envelope = withDecision(completeApprovedEnvelope(), 'hosting', missingRecord('hosting'));
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.result.status, 'not-ready');
  assert.equal(evaluated.result.blockedByFounder, true);
});

test('a missing privacy/legal decision blocks readiness as not-ready', () => {
  const envelope = withDecision(
    completeApprovedEnvelope(),
    'privacy-legal-review',
    missingRecord('privacy-legal-review'),
  );
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.result.status, 'not-ready');
  assert.equal(evaluated.result.blockedByPrivacyLegal, true);
});

test('a missing engineering-only decision downgrades readiness to review-required, never blocked by founder or privacy/legal', () => {
  const envelope = withDecision(
    completeApprovedEnvelope(),
    'rate-limiting',
    missingRecord('rate-limiting'),
  );
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.result.status, 'review-required');
  assert.equal(evaluated.result.blockedByFounder, false);
  assert.equal(evaluated.result.blockedByPrivacyLegal, false);
});

test('proposed, rejected, and expired statuses each block readiness with their own reason', () => {
  const cases = [
    ['proposed', 'decision-proposed-not-approved'],
    ['rejected', 'decision-rejected'],
    ['expired', 'decision-expired'],
  ];
  for (const [status, blocker] of cases) {
    const record = {
      decisionArea: 'monitoring',
      status,
      evidenceRef: 'evidence-monitoring-01',
      approverClass: null,
      approvedAtIso: null,
      evidenceAtIso: NOW,
    };
    const envelope = withDecision(completeApprovedEnvelope(), 'monitoring', record);
    const evaluated = evaluateDailyStylistProductionReadiness(envelope);
    assert.equal(evaluated.ok, true);
    assert.equal(evaluated.result.status, 'not-ready');
    const decision = evaluated.result.decisions.find((d) => d.decisionArea === 'monitoring');
    assert.deepEqual(decision.blockers, [blocker]);
  }
});

test('privacy/legal and founder gates cannot be satisfied by engineering-only evidence', () => {
  const envelope = completeApprovedEnvelope({
    decisions: DECISION_AREAS.map((area) => approvedRecord(area, { approverClass: 'engineering' })),
  });
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.result.status, 'not-ready');
  assert.equal(evaluated.result.blockedByFounder, true);
  assert.equal(evaluated.result.blockedByPrivacyLegal, true);
  for (const decision of evaluated.result.decisions) {
    if (REQUIRED_APPROVAL_CLASS[decision.decisionArea] === 'engineering') {
      assert.deepEqual(decision.blockers, []);
    } else {
      assert.deepEqual(decision.blockers, ['wrong-approver-class']);
    }
  }
});

test('a founder-required decision approved by any non-founder class is wrong-approver-class, never inferred as sufficient', () => {
  for (const approverClass of APPROVAL_CLASSES.filter((entry) => entry !== 'founder')) {
    const envelope = withDecision(
      completeApprovedEnvelope(),
      'auth-session-provider',
      approvedRecord('auth-session-provider', { approverClass }),
    );
    const evaluated = evaluateDailyStylistProductionReadiness(envelope);
    assert.equal(evaluated.result.status, 'not-ready');
    const decision = evaluated.result.decisions.find((d) => d.decisionArea === 'auth-session-provider');
    assert.deepEqual(decision.blockers, ['wrong-approver-class']);
  }
});

test('stale approved evidence blocks readiness even from the correct approver class', () => {
  const staleIso = '2025-01-01T00:00:00.000Z';
  assert.ok(
    (new Date(NOW).getTime() - new Date(staleIso).getTime()) / 86_400_000 > EVIDENCE_MAX_AGE_DAYS,
  );
  const envelope = withDecision(
    completeApprovedEnvelope(),
    'hosting',
    approvedRecord('hosting', { approvedAtIso: staleIso }),
  );
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.result.status, 'not-ready');
  const decision = evaluated.result.decisions.find((d) => d.decisionArea === 'hosting');
  assert.equal(decision.freshness, 'stale');
  assert.deepEqual(decision.blockers, ['decision-evidence-stale']);
});

test('evidence exactly at the freshness boundary is fresh; evidence one day beyond it is stale', () => {
  const boundaryIso = new Date(new Date(NOW).getTime() - EVIDENCE_MAX_AGE_DAYS * 86_400_000).toISOString();
  const beyondIso = new Date(
    new Date(NOW).getTime() - (EVIDENCE_MAX_AGE_DAYS + 1) * 86_400_000,
  ).toISOString();

  const freshEnvelope = withDecision(
    completeApprovedEnvelope(),
    'hosting',
    approvedRecord('hosting', { approvedAtIso: boundaryIso }),
  );
  const staleEnvelope = withDecision(
    completeApprovedEnvelope(),
    'hosting',
    approvedRecord('hosting', { approvedAtIso: beyondIso }),
  );
  const freshDecision = evaluateDailyStylistProductionReadiness(freshEnvelope)
    .result.decisions.find((d) => d.decisionArea === 'hosting');
  const staleDecision = evaluateDailyStylistProductionReadiness(staleEnvelope)
    .result.decisions.find((d) => d.decisionArea === 'hosting');
  assert.equal(freshDecision.freshness, 'fresh');
  assert.equal(staleDecision.freshness, 'stale');
});

test('a partial envelope (fewer than ten decisions) fails closed', () => {
  const envelope = completeApprovedEnvelope({
    decisions: completeApprovedEnvelope().decisions.slice(0, 9),
  });
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
});

test('a duplicate decision area fails closed even when the envelope has ten entries', () => {
  const decisions = completeApprovedEnvelope().decisions.slice(0, 9);
  decisions.push(approvedRecord('hosting'));
  const evaluated = evaluateDailyStylistProductionReadiness(completeApprovedEnvelope({ decisions }));
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'duplicate-decision-area');
});

test('an unknown decision area fails closed', () => {
  const decisions = completeApprovedEnvelope().decisions.slice(0, 9);
  decisions.push(approvedRecord('unsupported-area'));
  const evaluated = evaluateDailyStylistProductionReadiness(completeApprovedEnvelope({ decisions }));
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
});

test('an unknown field on a decision record fails closed', () => {
  const envelope = withDecision(
    completeApprovedEnvelope(),
    'hosting',
    { ...approvedRecord('hosting'), extraField: 'unexpected' },
  );
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
});

test('an unknown top-level envelope field fails closed', () => {
  const evaluated = evaluateDailyStylistProductionReadiness({
    ...completeApprovedEnvelope(),
    extraField: 'unexpected',
  });
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
});

test('an unsupported schema version fails closed', () => {
  const evaluated = evaluateDailyStylistProductionReadiness({
    ...completeApprovedEnvelope(),
    schemaVersion: 'daily-stylist-production-readiness-gate-v0',
  });
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
});

test('an unsupported decision status fails closed', () => {
  const envelope = withDecision(completeApprovedEnvelope(), 'hosting', {
    ...approvedRecord('hosting'),
    status: 'in-review',
  });
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
});

test('every closed decision status is individually accepted by the shape validator', () => {
  assert.deepEqual([...DECISION_STATUSES].sort(), ['approved', 'expired', 'missing', 'proposed', 'rejected']);
});

test('contradictory status/evidence/approval combinations fail closed', () => {
  const contradictions = [
    // approved status without an approver class or timestamp
    { ...approvedRecord('hosting'), approverClass: null },
    { ...approvedRecord('hosting'), approvedAtIso: null },
    // non-approved status carrying an approver class or approval timestamp
    { ...approvedRecord('hosting'), status: 'proposed' },
    { ...approvedRecord('hosting'), status: 'proposed', approverClass: null },
    // missing status carrying evidence
    { ...missingRecord('hosting'), evidenceRef: 'evidence-hosting-01' },
    { ...missingRecord('hosting'), evidenceAtIso: NOW },
    // non-missing status without an evidence reference or evidence timestamp
    { ...approvedRecord('hosting'), evidenceRef: null },
    { ...approvedRecord('hosting'), evidenceAtIso: null },
  ];
  for (const record of contradictions) {
    const envelope = withDecision(completeApprovedEnvelope(), 'hosting', record);
    const evaluated = evaluateDailyStylistProductionReadiness(envelope);
    assert.equal(evaluated.ok, false, JSON.stringify(record));
    assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
  }
});

test('over-broad, free-text, or URL-shaped evidence references fail closed', () => {
  const overBroad = [
    'https://example.com/private/legal-review',
    'this contains a raw legal clause and commercial rate',
    `evidence-${'x'.repeat(128)}`,
    'evidence with spaces',
    '{"secret":"value"}',
  ];
  for (const evidenceRef of overBroad) {
    const envelope = withDecision(
      completeApprovedEnvelope(),
      'privacy-legal-review',
      approvedRecord('privacy-legal-review', { evidenceRef }),
    );
    const evaluated = evaluateDailyStylistProductionReadiness(envelope);
    assert.equal(evaluated.ok, false);
    assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
  }
});

test('an unsupported approver class fails closed', () => {
  const envelope = withDecision(
    completeApprovedEnvelope(),
    'hosting',
    approvedRecord('hosting', { approverClass: 'contractor' }),
  );
  const evaluated = evaluateDailyStylistProductionReadiness(envelope);
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.error, 'closed-readiness-gate-envelope-required');
});

test('identical accepted input serializes byte-stably, regardless of submitted decision order', () => {
  const canonical = completeApprovedEnvelope();
  const reversed = completeApprovedEnvelope({ decisions: [...completeApprovedEnvelope().decisions].reverse() });
  const first = serializeDailyStylistProductionReadinessPacket(
    evaluateDailyStylistProductionReadiness(canonical).result,
  );
  const second = serializeDailyStylistProductionReadinessPacket(
    evaluateDailyStylistProductionReadiness(canonical).result,
  );
  const fromReversed = serializeDailyStylistProductionReadinessPacket(
    evaluateDailyStylistProductionReadiness(reversed).result,
  );
  assert.equal(first, second);
  assert.equal(first, fromReversed);
});

test('the aggregate status vocabulary is exactly the three closed values', () => {
  const statuses = new Set();
  statuses.add(evaluateDailyStylistProductionReadiness(completeApprovedEnvelope()).result.status);
  statuses.add(evaluateCurrentDailyStylistProductionReadiness().result.status);
  statuses.add(
    evaluateDailyStylistProductionReadiness(
      withDecision(completeApprovedEnvelope(), 'rate-limiting', missingRecord('rate-limiting')),
    ).result.status,
  );
  assert.deepEqual(
    [...statuses].sort(),
    ['not-ready', 'ready-for-implementation-review', 'review-required'],
  );
});

test('ready-for-implementation-review never widens beyond a future implementation design review', () => {
  const evaluated = evaluateDailyStylistProductionReadiness(completeApprovedEnvelope());
  assert.deepEqual(evaluated.result.authorizationScope, READINESS_GATE_AUTHORIZATION_SCOPE);
  assert.equal(evaluated.result.authorizationScope.authorizesFutureImplementationReviewOnly, true);
  for (const key of Object.keys(evaluated.result.authorizationScope)) {
    if (key === 'authorizesFutureImplementationReviewOnly') continue;
    assert.equal(evaluated.result.authorizationScope[key], false, key);
  }
});

test('the authorization scope never authorizes anything even for the current not-ready state', () => {
  const evaluated = evaluateCurrentDailyStylistProductionReadiness();
  assert.deepEqual(evaluated.result.authorizationScope, READINESS_GATE_AUTHORIZATION_SCOPE);
});

test('output contains only the allowed closed fields per decision, no submitted approver class or raw evidence body', () => {
  const evaluated = evaluateDailyStylistProductionReadiness(completeApprovedEnvelope());
  for (const decision of evaluated.result.decisions) {
    assert.deepEqual(
      Object.keys(decision).sort(),
      ['approvalClass', 'blockers', 'decisionArea', 'evidenceRef', 'freshness', 'nextStep', 'status'].sort(),
    );
  }
  const serialized = serializeDailyStylistProductionReadinessPacket(evaluated.result);
  for (const forbidden of ['secret', 'apiKey', 'password', 'ssn', 'commissionRate', 'contractTerms']) {
    assert.ok(!serialized.toLowerCase().includes(forbidden.toLowerCase()));
  }
});

test('every decision area maps to exactly one of the three closed approval classes', () => {
  for (const area of DECISION_AREAS) {
    assert.ok(APPROVAL_CLASSES.includes(REQUIRED_APPROVAL_CLASS[area]), area);
  }
  assert.equal(Object.keys(REQUIRED_APPROVAL_CLASS).length, DECISION_AREAS.length);
});
