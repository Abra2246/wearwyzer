import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  summarizeAffiliate,
  summarizeGuideFactory,
  summarizeImageRenderer,
} from '../ops-production-evidence.mjs';

const NOW = '2026-07-25T17:00:00.000Z';

test('Guide Factory reports a real empty queue as zero, not unavailable', () => {
  const result = summarizeGuideFactory({ jobs: [], statusEvents: [], available: true });
  assert.equal(result.state, 'idle');
  assert.equal(result.queuedCount, 0);
  assert.equal(result.currentJob, null);
});

test('Guide Factory identifies current, last, and last meaningful event', () => {
  const result = summarizeGuideFactory({
    jobs: [
      { jobId: 'old', status: 'ready-for-pr', createdAt: '2026-07-20T10:00:00.000Z' },
      { jobId: 'current', status: 'in-progress', createdAt: '2026-07-25T10:00:00.000Z' },
      { jobId: 'queued', status: 'approved', createdAt: '2026-07-25T09:00:00.000Z' },
    ],
    statusEvents: [{ type: 'guide-job-ready-for-pr', timestampIso: '2026-07-25T12:00:00.000Z' }],
    available: true,
  });
  assert.equal(result.currentJob.jobId, 'current');
  assert.equal(result.lastJob.jobId, 'current');
  assert.equal(result.queuedCount, 1);
  assert.equal(result.lastMeaningfulEventIso, '2026-07-25T12:00:00.000Z');
});

test('Image renderer keeps a missing ledger distinct from a real zero-dollar ledger', () => {
  const missing = summarizeImageRenderer({ available: false, now: NOW });
  assert.equal(missing.monthlySpendUsd, null);
  assert.equal(missing.renderCount, null);

  const empty = summarizeImageRenderer({ available: true, ledger: [], now: NOW });
  assert.equal(empty.monthlySpendUsd, 0);
  assert.equal(empty.renderCount, 0);
  assert.equal(empty.mode, 'unavailable');
});

test('Image renderer summarizes current-month spend and recorded execution mode', () => {
  const result = summarizeImageRenderer({
    available: true,
    now: NOW,
    ledger: [
      { timestampIso: '2026-06-20T10:00:00.000Z', costUsd: 10, accepted: true, mode: 'live' },
      { timestampIso: '2026-07-25T10:00:00.000Z', costUsd: 0.07, accepted: false, mode: 'simulation' },
    ],
  });
  assert.equal(result.monthlySpendUsd, 0.07);
  assert.equal(result.renderCount, 2);
  assert.equal(result.failureCount, 1);
  assert.equal(result.mode, 'simulation');
  assert.equal(result.lastResult, 'rejected');
});

test('Affiliate report keeps missing metrics unavailable and computes supported counts', () => {
  const missing = summarizeAffiliate(null, { available: false });
  assert.equal(missing.portfolioCoveragePct, null);
  assert.equal(missing.verifiedCount, null);

  const result = summarizeAffiliate({
    generatedAtIso: NOW,
    portfolioCoverage: { totalItems: 10, eligibleItems: 8, coveragePct: 80 },
    guideCoverages: [{ guideId: 'guide-1', coveragePct: 80, meetsTarget: true }],
    brokenCount: 1,
  });
  assert.equal(result.state, 'on-target');
  assert.equal(result.verifiedCount, 8);
  assert.equal(result.unverifiedCount, 2);
  assert.equal(result.brokenCount, 1);
  assert.equal(result.staleCount, null);
  assert.equal(result.outOfStockCount, null);
});

test('Malformed evidence fails closed instead of becoming zero', () => {
  const affiliate = summarizeAffiliate({ portfolioCoverage: {}, guideCoverages: [] });
  assert.equal(affiliate.state, 'unavailable');
  assert.equal(affiliate.portfolioCoveragePct, null);
  assert.equal(affiliate.verifiedCount, null);

  const guide = summarizeGuideFactory({ jobs: null, available: false });
  assert.equal(guide.state, 'unavailable');
  assert.equal(guide.queuedCount, null);
});

test('Mission Control renders production evidence cards instead of Phase 3 placeholders', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const html = readFileSync(path.join(root, 'mission-control.dc.html'), 'utf8');
  assert.match(html, /productionCards/);
  assert.match(html, /Portfolio coverage:/);
  assert.doesNotMatch(html, /notWiredCards/);
});
