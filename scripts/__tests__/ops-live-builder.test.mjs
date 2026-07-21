import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSource,
  buildNotWiredSource,
  aggregateOverallState,
  detectStalledHandoff,
  computeDispatchStalledSince,
  detectStalledDispatch,
  DISPATCH_SLA_MINUTES,
  buildCeoSummary,
  mergeAutomationFeed,
  feedEventsFromStatusLog,
  feedEventsFromGitHubState,
  buildLiveFeed,
} from '../ops-live-builder.mjs';
import { validateLiveFeedShape, findSecretLikeValues } from '../ops-live-schema.mjs';

const NOW = '2026-07-14T12:00:00.000Z';
const THRESHOLDS = { staleAfterMinutes: 10, offlineAfterMinutes: 45 };

function minutesAgo(iso, minutes) {
  return new Date(new Date(iso).getTime() - minutes * 60000).toISOString();
}

test('buildSource: successful fetch is live with the fresh data and current timestamp', () => {
  const source = buildSource({
    name: 'engineering',
    fetchOk: true,
    freshData: { foo: 'bar' },
    previous: null,
    now: NOW,
    thresholds: THRESHOLDS,
  });
  assert.equal(source.state, 'live');
  assert.equal(source.lastUpdatedIso, NOW);
  assert.equal(source.fetchOk, true);
  assert.deepEqual(source.data, { foo: 'bar' });
});

test('buildSource: first-ever run with a failed fetch is offline (no last-known-good to fall back to)', () => {
  const source = buildSource({ name: 'engineering', fetchOk: false, freshData: null, previous: null, now: NOW, thresholds: THRESHOLDS });
  assert.equal(source.state, 'offline');
  assert.equal(source.data, null);
});

test('buildSource: a failed fetch with recent last-known-good preserves the data and shows delayed once stale, not blank', () => {
  const previous = { wired: true, state: 'live', lastUpdatedIso: minutesAgo(NOW, 20), fetchOk: true, data: { foo: 'old-but-real' }, note: null };
  const source = buildSource({ name: 'engineering', fetchOk: false, freshData: null, previous, now: NOW, thresholds: THRESHOLDS });
  assert.equal(source.state, 'delayed');
  assert.equal(source.fetchOk, false);
  assert.deepEqual(source.data, { foo: 'old-but-real' }, 'last-known-good data must be preserved, not dropped');
  assert.equal(source.lastUpdatedIso, previous.lastUpdatedIso, 'lastUpdatedIso must not advance on a failed fetch');
});

test('buildSource: a failed fetch with very old last-known-good goes offline', () => {
  const previous = { wired: true, state: 'delayed', lastUpdatedIso: minutesAgo(NOW, 90), fetchOk: true, data: { foo: 'ancient' }, note: null };
  const source = buildSource({ name: 'engineering', fetchOk: false, freshData: null, previous, now: NOW, thresholds: THRESHOLDS });
  assert.equal(source.state, 'offline');
});

test('aggregateOverallState: both critical sources live -> live', () => {
  const sources = {
    engineering: { state: 'live' },
    deployment: { state: 'live' },
    content: { state: 'not-wired' },
    image: { state: 'not-wired' },
    affiliate: { state: 'not-wired' },
  };
  assert.equal(aggregateOverallState(sources), 'live');
});

test('aggregateOverallState: one critical source delayed drags the whole system to delayed, not live ("no fake green")', () => {
  const sources = { engineering: { state: 'live' }, deployment: { state: 'delayed' }, content: { state: 'not-wired' }, image: { state: 'not-wired' }, affiliate: { state: 'not-wired' } };
  assert.equal(aggregateOverallState(sources), 'delayed');
});

test('aggregateOverallState: any critical source offline forces overall offline, even if the other is live', () => {
  const sources = { engineering: { state: 'offline' }, deployment: { state: 'live' }, content: { state: 'not-wired' }, image: { state: 'not-wired' }, affiliate: { state: 'not-wired' } };
  assert.equal(aggregateOverallState(sources), 'offline');
});

test('aggregateOverallState: not-wired non-critical sources never affect the aggregate', () => {
  const sources = { engineering: { state: 'live' }, deployment: { state: 'live' }, content: { state: 'not-wired' }, image: { state: 'not-wired' }, affiliate: { state: 'not-wired' } };
  assert.equal(aggregateOverallState(sources), 'live');
});

test('detectStalledHandoff: working, no PR, well past grace period -> stalled', () => {
  const activeIssue = { number: 7, title: 'Do the thing', updatedIso: minutesAgo(NOW, 30) };
  const result = detectStalledHandoff({ automationState: 'working', activeIssue, pr: null, now: NOW });
  assert.equal(result.stalled, true);
  assert.match(result.reason, /#7/);
});

test('detectStalledHandoff: working, no PR, within grace period -> not stalled yet', () => {
  const activeIssue = { number: 7, title: 'Do the thing', updatedIso: minutesAgo(NOW, 5) };
  const result = detectStalledHandoff({ automationState: 'working', activeIssue, pr: null, now: NOW });
  assert.equal(result.stalled, false);
});

test('detectStalledHandoff: a PR already exists -> not stalled regardless of age', () => {
  const activeIssue = { number: 7, title: 'Do the thing', updatedIso: minutesAgo(NOW, 90) };
  const result = detectStalledHandoff({ automationState: 'working', activeIssue, pr: { number: 8 }, now: NOW });
  assert.equal(result.stalled, false);
});

test('detectStalledHandoff: automationState other than working never reports stalled', () => {
  const activeIssue = { number: 7, title: 'Do the thing', updatedIso: minutesAgo(NOW, 90) };
  assert.equal(detectStalledHandoff({ automationState: 'review', activeIssue, pr: null, now: NOW }).stalled, false);
  assert.equal(detectStalledHandoff({ automationState: 'idle', activeIssue: null, pr: null, now: NOW }).stalled, false);
});

test('computeDispatchStalledSince starts and preserves a queued-without-active clock', () => {
  const earlier = minutesAgo(NOW, 30);
  assert.equal(computeDispatchStalledSince({ automationState: 'queued', readyCount: 3, previousSinceIso: null, now: NOW }), NOW);
  assert.equal(computeDispatchStalledSince({ automationState: 'queued', readyCount: 3, previousSinceIso: earlier, now: NOW }), earlier);
});

test('computeDispatchStalledSince resets when work starts or the queue empties', () => {
  const earlier = minutesAgo(NOW, 30);
  assert.equal(computeDispatchStalledSince({ automationState: 'working', readyCount: 3, previousSinceIso: earlier, now: NOW }), null);
  assert.equal(computeDispatchStalledSince({ automationState: 'review', readyCount: 3, previousSinceIso: earlier, now: NOW }), null);
  assert.equal(computeDispatchStalledSince({ automationState: 'queued', readyCount: 0, previousSinceIso: earlier, now: NOW }), null);
});

test('detectStalledDispatch flags ready work beyond the dispatcher SLA', () => {
  const result = detectStalledDispatch({
    automationState: 'queued',
    readyCount: 3,
    dispatchStalledSinceIso: minutesAgo(NOW, DISPATCH_SLA_MINUTES + 1),
    now: NOW,
  });
  assert.equal(result.stalled, true);
  assert.match(result.reason, /Automation Queue Dispatcher/);
});

test('detectStalledDispatch does not flag within the SLA', () => {
  const result = detectStalledDispatch({
    automationState: 'queued',
    readyCount: 3,
    dispatchStalledSinceIso: minutesAgo(NOW, 15),
    now: NOW,
  });
  assert.equal(result.stalled, false);
});

test('buildCeoSummary distinguishes stalled dispatch from stalled handoff', () => {
  const engineering = {
    state: 'live',
    data: {
      automationState: 'queued',
      activeIssue: null,
      pr: null,
      queue: { readyCount: 3 },
      handoff: { stalled: true, reason: '3 issues are undispatched.' },
      ci: { status: 'passing', latestRunUrl: null },
    },
  };
  const deployment = { state: 'live', data: { status: 'healthy' } };
  const summary = buildCeoSummary({ overallState: 'live', engineering, deployment });
  assert.match(summary.headline, /not being dispatched/i);
  assert.equal(summary.requiredAction, '3 issues are undispatched.');
});

test('buildCeoSummary: an offline engineering source takes precedence over everything else', () => {
  const engineering = { state: 'offline', data: null };
  const deployment = { state: 'live', data: { status: 'healthy' } };
  const summary = buildCeoSummary({ overallState: 'offline', engineering, deployment });
  assert.match(summary.headline, /engineering data is unavailable/i);
});

test('buildCeoSummary: a stalled handoff is surfaced as the required action', () => {
  const engineering = {
    state: 'live',
    data: {
      automationState: 'working',
      activeIssue: { number: 9, title: 'Big feature', url: null },
      pr: null,
      queue: { readyCount: 0 },
      handoff: { stalled: true, reason: '#9 has been stuck for 40m.' },
      ci: { status: 'unknown', latestRunUrl: null },
    },
  };
  const deployment = { state: 'live', data: { status: 'healthy' } };
  const summary = buildCeoSummary({ overallState: 'live', engineering, deployment });
  assert.equal(summary.requiredAction, '#9 has been stuck for 40m.');
});

test('buildCeoSummary: nothing wrong -> healthy headline with no required action', () => {
  const engineering = {
    state: 'live',
    data: { automationState: 'idle', activeIssue: null, pr: null, queue: { readyCount: 0 }, handoff: { stalled: false, reason: null }, ci: { status: 'passing', latestRunUrl: null } },
  };
  const deployment = { state: 'live', data: { status: 'healthy' } };
  const summary = buildCeoSummary({ overallState: 'live', engineering, deployment });
  assert.equal(summary.requiredAction, null);
  assert.match(summary.headline, /healthy/i);
});

test('mergeAutomationFeed: dedups by key, keeping the existing (previous-run) entry rather than overwriting it', () => {
  const previous = [{ key: 'pr-opened:1', timestampIso: '2026-07-14T10:00:00.000Z', type: 'pr-opened', summary: 'original', url: null }];
  const candidates = [{ key: 'pr-opened:1', timestampIso: '2026-07-14T11:00:00.000Z', type: 'pr-opened', summary: 'should not win', url: null }];
  const merged = mergeAutomationFeed(previous, candidates);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].summary, 'original');
});

test('mergeAutomationFeed: new events are added and the result is sorted newest-first', () => {
  const previous = [{ key: 'a', timestampIso: '2026-07-14T09:00:00.000Z', type: 'x', summary: 'a', url: null }];
  const candidates = [{ key: 'b', timestampIso: '2026-07-14T11:00:00.000Z', type: 'x', summary: 'b', url: null }];
  const merged = mergeAutomationFeed(previous, candidates);
  assert.deepEqual(merged.map((e) => e.key), ['b', 'a']);
});

test('mergeAutomationFeed: caps to maxEvents, dropping the oldest', () => {
  const previous = Array.from({ length: 5 }, (_, i) => ({ key: `e${i}`, timestampIso: `2026-07-14T0${i}:00:00.000Z`, type: 'x', summary: `e${i}`, url: null }));
  const merged = mergeAutomationFeed(previous, [], { maxEvents: 3 });
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((e) => e.key), ['e4', 'e3', 'e2']);
});

test('feedEventsFromStatusLog maps status-log entries to feed events with a stable, unique key', () => {
  const events = feedEventsFromStatusLog([{ timestampIso: NOW, kind: 'routine', type: 'guide-published', summary: 'Guide published.' }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, `log:${NOW}:guide-published`);
});

test('feedEventsFromGitHubState: only completed CI runs become events, in-progress runs are skipped', () => {
  const events = feedEventsFromGitHubState({
    activeIssue: null,
    pr: null,
    ciRuns: [
      { id: 1, name: 'CI', conclusion: null, headBranch: 'main', updatedIso: NOW, htmlUrl: null },
      { id: 2, name: 'CI', conclusion: 'success', headBranch: 'main', updatedIso: NOW, htmlUrl: 'https://x/2' },
    ],
    mergedPrs: [],
    deployment: null,
    repoUrl: null,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'ci-run:2');
  assert.equal(events[0].type, 'ci-passed');
});

test('buildLiveFeed: end-to-end first run, both sources healthy -> overallState live and output passes schema validation', () => {
  const doc = buildLiveFeed(
    {
      engineering: {
        fetchOk: true,
        data: {
          automationState: 'idle',
          activeIssue: null,
          queue: { depth: 0, readyCount: 0, blockedCount: 0, stalledSinceIso: null },
          pr: null,
          ci: { status: 'passing', latestRunIso: NOW, latestRunUrl: 'https://x', recentFailureCount: 0 },
          handoff: { stalled: false, reason: null },
        },
      },
      deployment: { fetchOk: true, data: { status: 'healthy', lastHealthyShaShort: 'abc1234', lastDeployIso: NOW, ageMinutes: 3, pagesUrl: 'https://x' } },
      previousDoc: null,
      statusEvents: [],
      feedCandidates: [],
    },
    { now: NOW }
  );
  assert.equal(doc.overallState, 'live');
  const shapeCheck = validateLiveFeedShape(doc);
  assert.deepEqual(shapeCheck.errors, []);
  assert.deepEqual(findSecretLikeValues(doc), []);
});

test('buildLiveFeed: engineering fetch fails on a later run but last-known-good is recent -> delayed, not blank, and still schema-valid', () => {
  const previousDoc = buildLiveFeed(
    {
      engineering: {
        fetchOk: true,
        data: { automationState: 'idle', activeIssue: null, queue: { depth: 0, readyCount: 0, blockedCount: 0, stalledSinceIso: null }, pr: null, ci: { status: 'passing', latestRunIso: NOW, latestRunUrl: null, recentFailureCount: 0 }, handoff: { stalled: false, reason: null } },
      },
      deployment: { fetchOk: true, data: { status: 'healthy', lastHealthyShaShort: 'abc1234', lastDeployIso: NOW, ageMinutes: 0, pagesUrl: null } },
      previousDoc: null,
      statusEvents: [],
      feedCandidates: [],
    },
    { now: minutesAgo(NOW, 15) }
  );

  const nextDoc = buildLiveFeed(
    { engineering: { fetchOk: false, data: null }, deployment: { fetchOk: false, data: null }, previousDoc, statusEvents: [], feedCandidates: [] },
    { now: NOW }
  );

  assert.equal(nextDoc.sources.engineering.state, 'delayed');
  assert.equal(nextDoc.sources.engineering.data.automationState, 'idle', 'last-known-good engineering data must survive the failed fetch');
  assert.equal(nextDoc.overallState, 'delayed');
  assert.deepEqual(validateLiveFeedShape(nextDoc).errors, []);
});

test('buildLiveFeed: first-ever run with no token/no data at all -> fully offline, still schema-valid, honest empty state', () => {
  const doc = buildLiveFeed({ engineering: null, deployment: null, previousDoc: null, statusEvents: [], feedCandidates: [] }, { now: NOW });
  assert.equal(doc.sources.engineering.state, 'offline');
  assert.equal(doc.sources.deployment.state, 'offline');
  assert.equal(doc.overallState, 'offline');
  assert.match(doc.ceo.headline, /unavailable/i);
  assert.deepEqual(validateLiveFeedShape(doc).errors, []);
});

test('buildNotWiredSource always has the not-wired shape', () => {
  const source = buildNotWiredSource('Phase 3.');
  assert.equal(source.wired, false);
  assert.equal(source.state, 'not-wired');
  assert.equal(source.data, null);
  assert.equal(source.note, 'Phase 3.');
});
