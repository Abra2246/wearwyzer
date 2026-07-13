import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIMITS,
  estimateCost,
  evaluateBudget,
  evaluateAttempt,
  recordSpend,
  countAcceptedImages,
  computeBackoffDelayMs,
  isRetryableError,
} from '../openai-cost-controls.mjs';

const NOW = '2026-07-13T00:00:00.000Z';

test('per-guide cap blocks before it would be exceeded', () => {
  const ledger = [{ guideId: 'g1', timestampIso: NOW, costUsd: 0.28, accepted: false }];
  const result = evaluateBudget({ ledger, guideId: 'g1', estimatedCostUsd: estimateCost('medium'), now: NOW });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /per-guide cap exceeded/);
});

test('monthly cap blocks even when the per-guide cap has room', () => {
  const ledger = Array.from({ length: 10 }, (_, i) => ({ guideId: `g${i}`, timestampIso: NOW, costUsd: 3, accepted: false }));
  const result = evaluateBudget({ ledger, guideId: 'g-new', estimatedCostUsd: estimateCost('medium'), now: NOW });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /monthly cap exceeded/);
});

test('spend outside the calendar month does not count toward the monthly cap', () => {
  const ledger = [{ guideId: 'g1', timestampIso: '2026-06-01T00:00:00.000Z', costUsd: 29, accepted: false }];
  const result = evaluateBudget({ ledger, guideId: 'g2', estimatedCostUsd: 0.07, now: NOW });
  assert.equal(result.allowed, true);
});

test('recordSpend is a pure append, never mutates the input ledger', () => {
  const ledger = [];
  const next = recordSpend(ledger, { guideId: 'g1', timestampIso: NOW, costUsd: 0.02, accepted: false });
  assert.deepEqual(ledger, []);
  assert.equal(next.length, 1);
});

test('evaluateAttempt blocks once max attempts per slide is exceeded', () => {
  const result = evaluateAttempt({ ledger: [], guideId: 'g1', attempt: 3, quality: 'low', now: NOW });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /max attempts per slide/);
});

test('evaluateAttempt blocks once the accepted-image ceiling per guide is reached', () => {
  const ledger = Array.from({ length: DEFAULT_LIMITS.maxAcceptedImagesPerGuide }, () => ({ guideId: 'g1', timestampIso: NOW, costUsd: 0, accepted: true }));
  assert.equal(countAcceptedImages(ledger, 'g1'), DEFAULT_LIMITS.maxAcceptedImagesPerGuide);
  const result = evaluateAttempt({ ledger, guideId: 'g1', attempt: 1, quality: 'low', now: NOW });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /max accepted images per guide/);
});

test('evaluateAttempt allows a normal first attempt within every limit', () => {
  const result = evaluateAttempt({ ledger: [], guideId: 'g1', attempt: 1, quality: 'low', now: NOW });
  assert.equal(result.allowed, true);
  assert.equal(result.estimatedCostUsd, estimateCost('low'));
});

test('computeBackoffDelayMs grows exponentially and caps at maxMs', () => {
  assert.equal(computeBackoffDelayMs(1, { baseMs: 500, maxMs: 8000 }), 500);
  assert.equal(computeBackoffDelayMs(2, { baseMs: 500, maxMs: 8000 }), 1000);
  assert.equal(computeBackoffDelayMs(10, { baseMs: 500, maxMs: 8000 }), 8000);
});

test('isRetryableError classifies transient vs terminal error types', () => {
  assert.equal(isRetryableError('rate_limited'), true);
  assert.equal(isRetryableError('server_error'), true);
  assert.equal(isRetryableError('network_error'), true);
  assert.equal(isRetryableError('invalid_key'), false);
  assert.equal(isRetryableError('missing_key'), false);
  assert.equal(isRetryableError('moderation_refused'), false);
});
