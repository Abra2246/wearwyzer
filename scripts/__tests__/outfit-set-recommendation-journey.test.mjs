import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  OUTFIT_SET_MODES,
  createOutfitSetRecommendationJourney,
} from '../outfit-set-recommendation-journey.mjs';

const route = readFileSync(
  new URL('../../outfit-set-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty, fixture-only, private-data-free, and external-action disabled', () => {
  const view = createOutfitSetRecommendationJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.privateDataAvailable, false);
  assert.equal(view.networkActionsAvailable, false);
  assert.equal(view.commerceActionsAvailable, false);
  assert.deepEqual(view.supportedModes, [...OUTFIT_SET_MODES]);
});

test('complete two and three outfit sets remain distinct and qualified', () => {
  const journey = createOutfitSetRecommendationJourney();
  let result = journey.run().view.result;
  assert.equal(result.status, 'recommended-set');
  assert.equal(result.desiredCount, 2);
  assert.equal(result.selectedOutfitIds.length, 2);
  journey.selectMode('three-outfit-set');
  result = journey.run().view.result;
  assert.equal(result.status, 'recommended-set');
  assert.equal(result.desiredCount, 3);
  assert.equal(result.selectedOutfitIds.length, 3);
});

test('owned-first preference remains inside a comparable quality band', () => {
  const journey = createOutfitSetRecommendationJourney();
  journey.selectMode('owned-first');
  const result = journey.run().view.result;
  assert.equal(result.status, 'recommended-set');
  assert.ok(result.decisionReasonCodes.includes('owned-first-preference-within-quality-band'));
  assert.equal(result.selectedOutfitIds.includes('look-prospective'), false);
});

test('duplicate formulas become insufficiency rather than invented variety', () => {
  const journey = createOutfitSetRecommendationJourney();
  journey.selectMode('duplicate-formula');
  const result = journey.run().view.result;
  assert.equal(result.status, 'insufficient-candidates');
  assert.deepEqual(result.qualifiedOutfitIds, ['look-distinct']);
  assert.equal(
    result.evaluations.filter(({ reasonCodes }) => reasonCodes.includes('duplicate-outfit-formula')).length,
    2,
  );
});

test('boundary tie remains reviewable with every tied ID', () => {
  const journey = createOutfitSetRecommendationJourney();
  journey.selectMode('boundary-tie');
  const result = journey.run().view.result;
  assert.equal(result.status, 'tie-review');
  assert.deepEqual(result.selectedOutfitIds, []);
  assert.equal(result.tiedOutfitIds.length, 3);
});

test('insufficient, none-qualified, and stale states remain honest', () => {
  const journey = createOutfitSetRecommendationJourney();
  const expected = {
    'insufficient-candidates': 'insufficient-candidates',
    'none-qualified': 'none-qualified',
    'stale-evidence': 'insufficient-candidates',
  };
  for (const [mode, status] of Object.entries(expected)) {
    journey.selectMode(mode);
    assert.equal(journey.run().view.result.status, status);
  }
});

test('stale product evidence stays visible as an exclusion reason', () => {
  const journey = createOutfitSetRecommendationJourney();
  journey.selectMode('stale-evidence');
  const result = journey.run().view.result;
  const stale = result.evaluations.find(({ outfitId }) => outfitId === 'look-stale');
  assert.equal(stale.eligible, false);
  assert.ok(stale.reasonCodes.includes('product-evidence-not-current'));
});

test('changing mode and reset clear prior results', () => {
  const journey = createOutfitSetRecommendationJourney();
  journey.run();
  journey.selectMode('boundary-tie');
  assert.equal(journey.getView().result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'two-outfit-set');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createOutfitSetRecommendationJourney().selectMode('shop-the-look').error,
    'unsupported-outfit-set-mode',
  );
});

test('journey output excludes private profile, behavior, and commerce data', () => {
  const serialized = JSON.stringify(createOutfitSetRecommendationJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /profile|wardrobe|privateNote|browsing|purchase|return|price|retailer|affiliate|commission|popularity|account/i,
  );
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_outfit_set'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html') && name !== 'outfit-set-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('outfit-set-fixture.dc.html'));
  assert.deepEqual(references, []);
});

test('route has no network, private-data, commerce, or accessibility regressions', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account|camera|upload|track|save)"/);
  assert.match(route, /External actions:<\/strong> unavailable/);
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
});
