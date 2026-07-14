import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLiveFeedShape,
  computeSourceState,
  findSecretLikeValues,
  LIVE_SCHEMA_VERSION,
} from '../ops-live-schema.mjs';

const NOW = '2026-07-14T12:00:00.000Z';

function validEngineeringSource(overrides = {}) {
  return {
    wired: true,
    state: 'live',
    lastUpdatedIso: NOW,
    fetchOk: true,
    note: null,
    data: {
      automationState: 'idle',
      activeIssue: null,
      queue: { depth: 0, readyCount: 0, blockedCount: 0 },
      pr: null,
      ci: { status: 'unknown', latestRunIso: null, latestRunUrl: null, recentFailureCount: 0 },
      handoff: { stalled: false, reason: null },
    },
    ...overrides,
  };
}

function validDeploymentSource(overrides = {}) {
  return {
    wired: true,
    state: 'live',
    lastUpdatedIso: NOW,
    fetchOk: true,
    note: null,
    data: { status: 'healthy', lastHealthyShaShort: 'abc1234', lastDeployIso: NOW, ageMinutes: 5, pagesUrl: 'https://example.com/' },
    ...overrides,
  };
}

function notWired(note = 'not wired yet') {
  return { wired: false, state: 'not-wired', lastUpdatedIso: null, fetchOk: false, data: null, note };
}

function validDoc(overrides = {}) {
  return {
    schemaVersion: LIVE_SCHEMA_VERSION,
    generatedAtIso: NOW,
    overallState: 'live',
    ceo: { headline: 'Everything is healthy — no action needed.', requiredAction: null, activeWorkSummary: null },
    sources: {
      engineering: validEngineeringSource(),
      deployment: validDeploymentSource(),
      content: notWired(),
      image: notWired(),
      affiliate: notWired(),
    },
    automationFeed: [],
    ...overrides,
  };
}

test('a fully valid live-feed document passes validation', () => {
  const result = validateLiveFeedShape(validDoc());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('wrong schemaVersion is rejected', () => {
  const result = validateLiveFeedShape(validDoc({ schemaVersion: 2 }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('schemaVersion')));
});

test('unknown top-level key is rejected (closed schema)', () => {
  const doc = validDoc();
  doc.githubToken = 'ghp_shouldnotbehere';
  const result = validateLiveFeedShape(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('unexpected key "githubToken"')));
});

test('invalid overallState is rejected', () => {
  const result = validateLiveFeedShape(validDoc({ overallState: 'green' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('overallState')));
});

test('a not-wired source must have null data/lastUpdatedIso and a note', () => {
  const doc = validDoc();
  doc.sources.content = { wired: false, state: 'not-wired', lastUpdatedIso: null, fetchOk: false, data: { spend: 12 }, note: null };
  const result = validateLiveFeedShape(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('sources.content.data must be null')));
  assert.ok(result.errors.some((e) => e.includes('sources.content.note must be a non-empty string')));
});

test('a wired source with an out-of-enum state is rejected', () => {
  const doc = validDoc();
  doc.sources.engineering.state = 'green';
  const result = validateLiveFeedShape(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('sources.engineering.state')));
});

test('engineering data rejects an unknown nested key (closed shape)', () => {
  const doc = validDoc();
  doc.sources.engineering.data.secretToken = 'ghp_abc';
  const result = validateLiveFeedShape(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('sources.engineering.data has unexpected key "secretToken"')));
});

test('automationFeed rejects a duplicate key', () => {
  const doc = validDoc({
    automationFeed: [
      { key: 'pr-opened:1', timestampIso: NOW, type: 'pr-opened', summary: 'PR #1 opened.', url: null },
      { key: 'pr-opened:1', timestampIso: NOW, type: 'pr-opened', summary: 'PR #1 opened again.', url: null },
    ],
  });
  const result = validateLiveFeedShape(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate key')));
});

test('automationFeed rejects exceeding the max event cap', () => {
  const events = Array.from({ length: 51 }, (_, i) => ({
    key: `log:${i}`,
    timestampIso: NOW,
    type: 'routine',
    summary: `event ${i}`,
    url: null,
  }));
  const result = validateLiveFeedShape(validDoc({ automationFeed: events }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('must not exceed')));
});

test('validateLiveFeedShape and findSecretLikeValues compose to catch a leaked token even under a valid shape', () => {
  const doc = validDoc();
  doc.ceo.requiredAction = 'Rotate token ghp_' + 'x'.repeat(36);
  assert.deepEqual(validateLiveFeedShape(doc).errors, []); // shape itself is fine
  const findings = findSecretLikeValues(doc);
  assert.ok(findings.length > 0, 'the ghp_ token pattern should be caught');
});

test('computeSourceState: fresh timestamp is live', () => {
  const state = computeSourceState(NOW, { now: NOW, staleAfterMinutes: 10, offlineAfterMinutes: 45 });
  assert.equal(state, 'live');
});

test('computeSourceState: just past the stale threshold is delayed, not offline', () => {
  const now = new Date(new Date(NOW).getTime() + 11 * 60000).toISOString();
  const state = computeSourceState(NOW, { now, staleAfterMinutes: 10, offlineAfterMinutes: 45 });
  assert.equal(state, 'delayed');
});

test('computeSourceState: past the offline threshold is offline', () => {
  const now = new Date(new Date(NOW).getTime() + 46 * 60000).toISOString();
  const state = computeSourceState(NOW, { now, staleAfterMinutes: 10, offlineAfterMinutes: 45 });
  assert.equal(state, 'offline');
});

test('computeSourceState: null lastUpdatedIso is always offline', () => {
  assert.equal(computeSourceState(null, { now: NOW, staleAfterMinutes: 10, offlineAfterMinutes: 45 }), 'offline');
});

test('computeSourceState: exactly at the stale boundary is still live (strictly-greater-than semantics)', () => {
  const now = new Date(new Date(NOW).getTime() + 10 * 60000).toISOString();
  const state = computeSourceState(NOW, { now, staleAfterMinutes: 10, offlineAfterMinutes: 45 });
  assert.equal(state, 'live');
});
