import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  PURCHASE_SIMULATOR_MODES,
  createPurchaseSimulatorJourney,
} from '../purchase-simulator-journey.mjs';

const route = readFileSync(
  new URL('../../purchase-simulator-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty, fixture-only, and commerce-disabled', () => {
  const view = createPurchaseSimulatorJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.commerceActionsAvailable, false);
  assert.deepEqual(view.supportedModes, [...PURCHASE_SIMULATOR_MODES]);
});

test('every review mode produces its declared honest outcome', () => {
  const expected = {
    'best-fit': 'selected',
    tie: 'tie',
    'buy-none': 'buy-none',
    'excluded-evidence': 'buy-none',
  };
  const journey = createPurchaseSimulatorJourney();
  for (const mode of PURCHASE_SIMULATOR_MODES) {
    journey.selectMode(mode);
    const result = journey.run();
    assert.equal(result.ok, true);
    assert.equal(result.view.result.decision.status, expected[mode]);
  }
});

test('tie remains explicit and excluded evidence cannot select a product', () => {
  const journey = createPurchaseSimulatorJourney();
  journey.selectMode('tie');
  const tied = journey.run().view.result;
  assert.equal(tied.decision.selectedCandidateIds.length, 2);
  journey.selectMode('excluded-evidence');
  const excluded = journey.run().view.result;
  assert.deepEqual(excluded.decision.selectedCandidateIds, []);
  assert.ok(excluded.candidates.every(({ status }) => status === 'source-stale'));
});

test('changing mode and reset clear prior results', () => {
  const journey = createPurchaseSimulatorJourney();
  journey.run();
  journey.selectMode('buy-none');
  assert.equal(journey.getView().result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'best-fit');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createPurchaseSimulatorJourney().selectMode('live-store').error,
    'unsupported-purchase-simulator-mode',
  );
});

test('journey output excludes private and affiliate data', () => {
  const serialized = JSON.stringify(createPurchaseSimulatorJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /fixture-user|preferredColors|fitPreferences|affiliate|commission|wardrobeSnapshot/,
  );
});

test('route is noindex, default-off, and exact-flag gated', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_purchase_simulator'\) === '1'/);
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
    .filter((name) => name.endsWith('.dc.html') && name !== 'purchase-simulator-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('purchase-simulator-fixture.dc.html'));
  assert.deepEqual(references, []);
});
