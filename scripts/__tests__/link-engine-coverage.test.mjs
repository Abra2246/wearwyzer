import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COVERAGE_TARGET,
  computeGuideCoverage,
  computePortfolioCoverage,
  logCoverageShortfall,
  trackShortfallRecurrence,
} from '../link-engine-coverage.mjs';
import {
  GUIDE_COVERAGE_BELOW_TARGET_ITEMS,
  GUIDE_COVERAGE_AT_TARGET_ITEMS,
  GUIDE_COVERAGE_ABOVE_TARGET_ITEMS,
  FIXTURE_NOW,
} from '../__fixtures__/link-engine.mjs';

test('COVERAGE_TARGET matches the issue-specified 80-90% operating band', () => {
  assert.equal(COVERAGE_TARGET.minPct, 80);
  assert.equal(COVERAGE_TARGET.maxPct, 90);
});

test('computeGuideCoverage below target reports the correct percentage, shortfall, and meetsTarget=false', () => {
  const coverage = computeGuideCoverage('guide-a', GUIDE_COVERAGE_BELOW_TARGET_ITEMS);
  assert.equal(coverage.totalItems, 5);
  assert.equal(coverage.eligibleItems, 3);
  assert.equal(coverage.coveragePct, 60);
  assert.equal(coverage.meetsTarget, false);
  assert.equal(coverage.shortfallPct, 20);
});

test('computeGuideCoverage exactly at the 80% minimum meets the target', () => {
  const coverage = computeGuideCoverage('guide-b', GUIDE_COVERAGE_AT_TARGET_ITEMS);
  assert.equal(coverage.coveragePct, 80);
  assert.equal(coverage.meetsTarget, true);
  assert.equal(coverage.shortfallPct, 0);
});

test('computeGuideCoverage above target (100%) meets the target', () => {
  const coverage = computeGuideCoverage('guide-c', GUIDE_COVERAGE_ABOVE_TARGET_ITEMS);
  assert.equal(coverage.coveragePct, 100);
  assert.equal(coverage.meetsTarget, true);
});

test('computeGuideCoverage on an empty item list reports 0% without dividing by zero', () => {
  const coverage = computeGuideCoverage('guide-empty', []);
  assert.equal(coverage.totalItems, 0);
  assert.equal(coverage.coveragePct, 0);
  assert.equal(coverage.meetsTarget, false);
});

test('computePortfolioCoverage sums items across guides rather than averaging percentages', () => {
  const a = computeGuideCoverage('guide-a', GUIDE_COVERAGE_BELOW_TARGET_ITEMS); // 3/5
  const c = computeGuideCoverage('guide-c', GUIDE_COVERAGE_ABOVE_TARGET_ITEMS); // 5/5
  const portfolio = computePortfolioCoverage([a, c]);
  assert.equal(portfolio.totalItems, 10);
  assert.equal(portfolio.eligibleItems, 8);
  assert.equal(portfolio.coveragePct, 80);
  assert.equal(portfolio.meetsTarget, true);
  assert.equal(portfolio.guideCount, 2);
});

test('logCoverageShortfall returns null when the guide already meets the target', () => {
  const coverage = computeGuideCoverage('guide-b', GUIDE_COVERAGE_AT_TARGET_ITEMS);
  assert.equal(logCoverageShortfall(coverage, GUIDE_COVERAGE_AT_TARGET_ITEMS, { now: FIXTURE_NOW }), null);
});

test('logCoverageShortfall names the coverage percentage and every non-eligible item with a concrete reason', () => {
  const coverage = computeGuideCoverage('guide-a', GUIDE_COVERAGE_BELOW_TARGET_ITEMS);
  const log = logCoverageShortfall(coverage, GUIDE_COVERAGE_BELOW_TARGET_ITEMS, { now: FIXTURE_NOW });
  assert.equal(log.guideId, 'guide-a');
  assert.equal(log.coveragePct, 60);
  assert.equal(log.targetMinPct, 80);
  assert.equal(log.loggedAtIso, FIXTURE_NOW);
  assert.equal(log.reasons.length, 2);
  assert.ok(log.reasons.every((r) => r.reason));
});

test('trackShortfallRecurrence flags a guide with two or more shortfalls as a sourcing-priority signal', () => {
  const entries = [
    { guideId: 'guide-a', coveragePct: 60 },
    { guideId: 'guide-a', coveragePct: 65 },
    { guideId: 'guide-b', coveragePct: 70 },
  ];
  const recurrence = trackShortfallRecurrence(entries);
  const guideA = recurrence.find((r) => r.guideId === 'guide-a');
  const guideB = recurrence.find((r) => r.guideId === 'guide-b');
  assert.equal(guideA.occurrences, 2);
  assert.equal(guideA.isSourcingPriority, true);
  assert.equal(guideB.occurrences, 1);
  assert.equal(guideB.isSourcingPriority, false);
});

test('trackShortfallRecurrence ignores null entries (guides that met target contribute nothing)', () => {
  const recurrence = trackShortfallRecurrence([null, { guideId: 'guide-a' }, null]);
  assert.equal(recurrence.length, 1);
  assert.equal(recurrence[0].occurrences, 1);
});
