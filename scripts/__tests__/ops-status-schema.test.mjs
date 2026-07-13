import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStatusShape, findSecretLikeValues, computeStaleness, STATUS_SCHEMA_VERSION } from '../ops-status-schema.mjs';

function validStatus(overrides = {}) {
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    generatedAtIso: '2026-07-13T12:00:00.000Z',
    overallHealth: 'green',
    automationState: 'idle',
    activeWork: null,
    queue: { depth: 0, readyCount: 0, blockedCount: 0 },
    ci: { status: 'unknown', lastRunIso: null, lastRunUrl: null },
    deployment: { status: 'unknown', lastHealthyShaShort: null, lastCheckedIso: null },
    guideFactory: { state: 'idle', activeJobId: null, queuedCount: 0 },
    imageRenderer: { state: 'idle', monthlySpendUsd: 0, monthlyCapUsd: 30, budgetPct: 0 },
    incident: { active: false, issueNumber: null, summary: null },
    blockers: [],
    lastMeaningfulActivityIso: null,
    staleAfterMinutes: 30,
    ...overrides,
  };
}

test('valid status schema passes validation', () => {
  const result = validateStatusShape(validStatus());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('missing required top-level field fails validation', () => {
  const status = validStatus();
  delete status.overallHealth;
  const result = validateStatusShape(status);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('overallHealth')));
});

test('unknown top-level key is rejected (closed schema)', () => {
  const status = validStatus({ apiKey: 'not-allowed-here' });
  const result = validateStatusShape(status);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('unexpected key "apiKey"')));
});

test('unknown nested key is rejected (closed schema)', () => {
  const status = validStatus();
  status.queue = { ...status.queue, secretToken: 'x' };
  const result = validateStatusShape(status);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('secretToken')));
});

test('invalid overallHealth enum value fails', () => {
  const result = validateStatusShape(validStatus({ overallHealth: 'purple' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('overallHealth')));
});

test('invalid automationState enum value fails', () => {
  const result = validateStatusShape(validStatus({ automationState: 'napping' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('automationState')));
});

test('each documented health state is a valid enum value', () => {
  for (const health of ['green', 'yellow', 'red']) {
    assert.equal(validateStatusShape(validStatus({ overallHealth: health })).valid, true);
  }
});

test('each documented automation state is a valid enum value', () => {
  for (const state of ['working', 'queued', 'review', 'blocked', 'failed', 'idle']) {
    assert.equal(validateStatusShape(validStatus({ automationState: state })).valid, true);
  }
});

test('findSecretLikeValues flags a credential-shaped key name even with an innocuous value', () => {
  const findings = findSecretLikeValues({ ci: { apiKey: 'hello' } });
  assert.equal(findings.length, 1);
  assert.match(findings[0].path, /apiKey/);
});

test('findSecretLikeValues flags a GitHub-token-shaped value under an innocuous key name', () => {
  const findings = findSecretLikeValues({ note: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' });
  assert.equal(findings.length, 1);
  assert.match(findings[0].path, /note/);
});

test('findSecretLikeValues flags an OpenAI-style key and a Bearer header', () => {
  const findings = findSecretLikeValues({ a: 'sk-abcdefghijklmnopqrstuvwx', b: 'Authorization: Bearer abcdef1234567890' });
  assert.equal(findings.length, 2);
});

test('findSecretLikeValues returns no findings for a clean status object (including a commit SHA)', () => {
  const findings = findSecretLikeValues(validStatus({ deployment: { status: 'healthy', lastHealthyShaShort: 'a1b2c3d', lastCheckedIso: '2026-07-13T12:00:00.000Z' } }));
  assert.deepEqual(findings, []);
});

test('computeStaleness reports fresh data as not stale', () => {
  const result = computeStaleness('2026-07-13T12:00:00.000Z', { now: '2026-07-13T12:05:00.000Z', staleAfterMinutes: 30 });
  assert.equal(result.stale, false);
  assert.equal(result.minutesSinceGenerated, 5);
});

test('computeStaleness reports old data as stale', () => {
  const result = computeStaleness('2026-07-13T12:00:00.000Z', { now: '2026-07-13T13:00:00.000Z', staleAfterMinutes: 30 });
  assert.equal(result.stale, true);
  assert.equal(result.minutesSinceGenerated, 60);
});

test('computeStaleness treats an unparseable timestamp as stale', () => {
  const result = computeStaleness('not-a-date', { now: '2026-07-13T13:00:00.000Z' });
  assert.equal(result.stale, true);
  assert.equal(result.minutesSinceGenerated, null);
});
