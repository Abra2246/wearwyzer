import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  FIT_INTELLIGENCE_MODES,
  createFitIntelligenceJourney,
} from '../fit-intelligence-journey.mjs';

const route = readFileSync(
  new URL('../../fit-intelligence-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty, fixture-only, measurement-free, and commerce-disabled', () => {
  const view = createFitIntelligenceJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.commerceActionsAvailable, false);
  assert.equal(view.sensitiveInputCollectionAvailable, false);
  assert.deepEqual(view.supportedModes, [...FIT_INTELLIGENCE_MODES]);
});

test('every review mode produces guidance or an explicit abstention', () => {
  const expected = {
    'verified-transfer': 'guidance-available',
    'correction-precedence': 'guidance-available',
    'low-confidence': 'guidance-available',
    'stale-evidence': 'stale-evidence',
    'conflicting-corrections': 'conflicting-fit-evidence',
    'unavailable-size': 'recommended-size-unavailable',
  };
  const journey = createFitIntelligenceJourney();
  for (const mode of FIT_INTELLIGENCE_MODES) {
    journey.selectMode(mode);
    const result = journey.run();
    assert.equal(result.ok, true);
    assert.equal(result.view.result.status, expected[mode]);
  }
});

test('correction precedence and low confidence remain visibly distinct', () => {
  const journey = createFitIntelligenceJourney();
  journey.selectMode('correction-precedence');
  const corrected = journey.run().view.result;
  assert.equal(corrected.recommendedSize, 'M');
  assert.equal(corrected.confidence, 'high');
  assert.equal(corrected.ownedItemComparisons.length, 1);
  journey.selectMode('low-confidence');
  const low = journey.run().view.result;
  assert.equal(low.recommendedSize, 'M');
  assert.equal(low.confidence, 'low');
  assert.ok(low.likelyIssues.includes('product-fit-tendency-unknown'));
});

test('unsafe evidence states never show a recommended size', () => {
  const journey = createFitIntelligenceJourney();
  for (const mode of ['stale-evidence', 'conflicting-corrections', 'unavailable-size']) {
    journey.selectMode(mode);
    assert.equal(journey.run().view.result.recommendedSize, null);
  }
});

test('changing mode and reset clear prior results', () => {
  const journey = createFitIntelligenceJourney();
  journey.run();
  journey.selectMode('stale-evidence');
  assert.equal(journey.getView().result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'verified-transfer');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createFitIntelligenceJourney().selectMode('scan-my-body').error,
    'unsupported-fit-intelligence-mode',
  );
});

test('journey output excludes private and commerce data', () => {
  const serialized = JSON.stringify(createFitIntelligenceJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /measurement|weight|height|bodyShape|photo|fitNote|affiliate|commission|price|retailer|account/i,
  );
});

test('route is noindex, default-off, and exact-flag gated', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_fit_intelligence'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
});

test('route has no network, collection, or commerce controls', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account|camera|upload|measure)"/);
  assert.match(route, /Commerce and collection actions:<\/strong> unavailable/);
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
    .filter((name) => name.endsWith('.dc.html') && name !== 'fit-intelligence-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('fit-intelligence-fixture.dc.html'));
  assert.deepEqual(references, []);
});
