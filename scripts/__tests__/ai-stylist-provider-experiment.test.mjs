import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_EXPERIMENT_EVIDENCE_VERSION,
  buildProviderDecisionPacket,
  createFixtureExperimentManifest,
  serializeProviderDecisionPacket,
  validateProviderExperimentManifest,
} from '../ai-stylist-provider-experiment.mjs';

function evidence(manifest, overrides = {}) {
  return {
    schemaVersion: PROVIDER_EXPERIMENT_EVIDENCE_VERSION,
    experimentId: manifest.experimentId,
    authorization: {
      externalProcessingApproved: true,
      credentialUseApproved: true,
      spendApproved: true,
      approvalReference: 'founder-approval-fixture-one',
    },
    observed: {
      requestCount: manifest.scenarioCount * manifest.candidateIds.length,
      usdSpentCents: 20,
      provenanceComplete: true,
      spendComplete: true,
      outputsComplete: true,
    },
    candidates: manifest.candidateIds.map((candidateId, index) => ({
      candidateId,
      trustPassed: true,
      editorialStatus: index === 0 ? 'selected' : 'not-selected',
    })),
    stopReasons: [],
    ...overrides,
  };
}

test('fixture manifest is closed, bounded, synthetic, and unauthorized by default', () => {
  const manifest = createFixtureExperimentManifest();
  assert.deepEqual(validateProviderExperimentManifest(manifest), { ok: true });
  assert.equal(manifest.scenarioCount, 15);
  assert.equal(manifest.limits.maxUsdCents, 30);
  assert.equal(manifest.authorization.spendApproved, false);
  assert.equal(manifest.authorization.approvalReference, null);
});

test('unknown manifest fields and private provider configuration fail closed', () => {
  const manifest = createFixtureExperimentManifest();
  assert.equal(
    validateProviderExperimentManifest({ ...manifest, notes: 'later' }).error,
    'experiment-manifest-closed-schema-required',
  );
  assert.equal(
    validateProviderExperimentManifest({ ...manifest, provider: 'external' }).error,
    'experiment-manifest-closed-schema-required',
  );
});

test('only the accepted complete synthetic corpus may be declared', () => {
  const manifest = createFixtureExperimentManifest();
  assert.equal(
    validateProviderExperimentManifest({ ...manifest, scenarioCount: 14 }).error,
    'accepted-synthetic-corpus-required',
  );
  assert.equal(
    validateProviderExperimentManifest({ ...manifest, fixtureVersion: 2 }).error,
    'accepted-synthetic-corpus-required',
  );
});

test('candidate aliases and hard ceilings are bounded', () => {
  const manifest = createFixtureExperimentManifest();
  assert.equal(
    validateProviderExperimentManifest({ ...manifest, candidateIds: ['openai-gpt'] }).error,
    'one-to-three-opaque-candidates-required',
  );
  assert.equal(
    validateProviderExperimentManifest({
      ...manifest,
      limits: { ...manifest.limits, maxUsdCents: 101 },
    }).error,
    'bounded-experiment-limits-required',
  );
});

test('a planning manifest cannot contain implicit authorization', () => {
  const manifest = createFixtureExperimentManifest();
  assert.equal(
    validateProviderExperimentManifest({
      ...manifest,
      authorization: { ...manifest.authorization, spendApproved: true },
    }).error,
    'zero-default-authorization-required',
  );
});

test('complete authorized evidence produces a sanitized complete packet', () => {
  const manifest = createFixtureExperimentManifest();
  const result = buildProviderDecisionPacket(manifest, evidence(manifest));
  assert.equal(result.packet.decision.status, 'complete');
  assert.deepEqual(Object.keys(result.packet).sort(), [
    'authorization',
    'candidateIds',
    'candidates',
    'decision',
    'experimentId',
    'fixtureVersion',
    'limits',
    'observed',
    'scenarioCount',
    'schemaVersion',
  ]);
  assert.equal(JSON.stringify(result).includes('"providerId"'), false);
  assert.equal(JSON.stringify(result).includes('"modelId"'), false);
  assert.equal(JSON.stringify(result).includes('"prompt"'), false);
});

test('missing founder authorization remains explicit', () => {
  const manifest = createFixtureExperimentManifest();
  const result = buildProviderDecisionPacket(
    manifest,
    evidence(manifest, { authorization: manifest.authorization }),
  );
  assert.equal(result.packet.decision.status, 'not-authorized');
});

test('missing provenance, spend, or output evidence is incomplete', () => {
  const manifest = createFixtureExperimentManifest();
  for (const key of ['provenanceComplete', 'spendComplete', 'outputsComplete']) {
    const result = buildProviderDecisionPacket(manifest, evidence(manifest, {
      observed: { ...evidence(manifest).observed, [key]: false },
    }));
    assert.equal(result.packet.decision.status, 'incomplete');
  }
});

test('request or spend ceiling breach stops the experiment', () => {
  const manifest = createFixtureExperimentManifest();
  const result = buildProviderDecisionPacket(manifest, evidence(manifest, {
    observed: { ...evidence(manifest).observed, usdSpentCents: 31 },
  }));
  assert.equal(result.packet.decision.status, 'stopped');
  assert.deepEqual(result.packet.decision.stopReasons, ['declared-limit-exceeded']);
});

test('declared provider or schema stop reasons stay explicit', () => {
  const manifest = createFixtureExperimentManifest();
  const result = buildProviderDecisionPacket(
    manifest,
    evidence(manifest, { stopReasons: ['provider-error'] }),
  );
  assert.equal(result.packet.decision.status, 'stopped');
  assert.deepEqual(result.packet.decision.stopReasons, ['provider-error']);
});

test('trust failure stops before editorial review', () => {
  const manifest = createFixtureExperimentManifest();
  const candidates = evidence(manifest).candidates.map((candidate, index) => (
    index === 0
      ? { ...candidate, trustPassed: false, editorialStatus: 'not-evaluated' }
      : candidate
  ));
  const result = buildProviderDecisionPacket(manifest, evidence(manifest, { candidates }));
  assert.equal(result.packet.decision.status, 'stopped-before-editorial');
  assert.deepEqual(result.packet.decision.stopReasons, ['trust-gate-failed']);
});

test('editorial evidence cannot exist for a trust-failing candidate', () => {
  const manifest = createFixtureExperimentManifest();
  const candidates = evidence(manifest).candidates.map((candidate, index) => (
    index === 0 ? { ...candidate, trustPassed: false, editorialStatus: 'selected' } : candidate
  ));
  assert.equal(
    buildProviderDecisionPacket(manifest, evidence(manifest, { candidates })).error,
    'trust-must-precede-editorial-review',
  );
});

test('ties and material editorial disagreement require review', () => {
  const manifest = createFixtureExperimentManifest();
  for (const editorialStatus of ['tie', 'review-required']) {
    const candidates = evidence(manifest).candidates.map((candidate, index) => (
      index === 0 ? { ...candidate, editorialStatus } : candidate
    ));
    assert.equal(
      buildProviderDecisionPacket(manifest, evidence(manifest, { candidates }))
        .packet.decision.status,
      'review-required',
    );
  }
});

test('private execution details and unknown evidence fields fail closed', () => {
  const manifest = createFixtureExperimentManifest();
  assert.equal(
    buildProviderDecisionPacket(manifest, { ...evidence(manifest), model: 'hidden' }).error,
    'experiment-evidence-closed-schema-required',
  );
  assert.equal(
    buildProviderDecisionPacket(manifest, {
      ...evidence(manifest),
      candidates: evidence(manifest).candidates.map((candidate, index) => (
        index === 0 ? { ...candidate, prompt: 'hidden' } : candidate
      )),
    }).error,
    'private-experiment-evidence-rejected',
  );
});

test('decision packet serialization is byte-stable', () => {
  const manifest = createFixtureExperimentManifest();
  const packet = buildProviderDecisionPacket(manifest, evidence(manifest)).packet;
  assert.equal(
    serializeProviderDecisionPacket(packet),
    serializeProviderDecisionPacket(structuredClone(packet)),
  );
});
