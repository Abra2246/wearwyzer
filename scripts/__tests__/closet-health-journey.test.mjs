import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  CLOSET_HEALTH_MODES,
  createClosetHealthJourney,
} from '../closet-health-journey.mjs';

const route = readFileSync(
  new URL('../../closet-health-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty, fixture-only, and commerce-disabled', () => {
  const view = createClosetHealthJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.commerceActionsAvailable, false);
  assert.deepEqual(view.supportedModes, [...CLOSET_HEALTH_MODES]);
});

test('every review mode returns decomposed Closet Health evidence', () => {
  const journey = createClosetHealthJourney();
  for (const mode of CLOSET_HEALTH_MODES) {
    assert.equal(journey.selectMode(mode).ok, true);
    const result = journey.run();
    assert.equal(result.ok, true);
    assert.equal(result.view.result.schemaVersion, 'closet-health-v1');
    assert.equal(typeof result.view.result.score, 'number');
    assert.deepEqual(Object.keys(result.view.result.components), [
      'roleBalance',
      'versatility',
      'redundancyHealth',
      'wearUtilization',
    ]);
  }
});

test('missing evidence lowers confidence and remains explicitly unavailable', () => {
  const journey = createClosetHealthJourney();
  const complete = journey.run().view.result;
  journey.selectMode('missing-wear-evidence');
  const missing = journey.run().view.result;
  assert.equal(complete.confidence, 'high');
  assert.equal(missing.confidence, 'low');
  assert.equal(missing.components.wearUtilization, null);
  assert.equal(
    missing.prioritizedActions.some(({ action }) => action === 'add-explicit-wear-evidence'),
    true,
  );
});

test('care evidence prioritizes repair, rediscovery, and styling owned items', () => {
  const journey = createClosetHealthJourney();
  journey.selectMode('care-needed');
  const health = journey.run().view.result;
  assert.deepEqual(health.prioritizedActions.slice(0, 3).map(({ action }) => action), [
    'repair-owned-item',
    'rediscover-owned-item',
    'style-never-worn-item',
  ]);
});

test('correction mode exposes redundancy and unresolved evidence without buying', () => {
  const journey = createClosetHealthJourney();
  journey.selectMode('correction-needed');
  const health = journey.run().view.result;
  assert.deepEqual(health.evidence.duplicateGroups, [[
    'owned-cream-tee',
    'owned-cream-tee-two',
  ]]);
  assert.deepEqual(health.evidence.unresolvedItemIds, ['owned-unresolved-item']);
  assert.ok(health.prioritizedActions.every(({ action }) => !action.includes('buy')));
});

test('changing mode and reset clear prior results', () => {
  const journey = createClosetHealthJourney();
  journey.run();
  journey.selectMode('care-needed');
  assert.equal(journey.getView().result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'complete-evidence');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createClosetHealthJourney().selectMode('shop-more').error,
    'unsupported-closet-health-mode',
  );
});

test('journey output excludes private and affiliate data', () => {
  const serialized = JSON.stringify(createClosetHealthJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /fixture-user|preferredColors|fitPreferences|affiliate|commission|price|fitNote|wornAt|occasion/i,
  );
});

test('route is noindex, default-off, and exact-flag gated', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_closet_health'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
});

test('route has no network or commerce controls', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account)"/);
  assert.match(route, /Commerce actions:<\/strong> unavailable/);
});

test('route keeps mobile and keyboard safeguards', () => {
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
});

test('no public page links to the fixture route', () => {
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html') && name !== 'closet-health-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('closet-health-fixture.dc.html'));
  assert.deepEqual(references, []);
});
