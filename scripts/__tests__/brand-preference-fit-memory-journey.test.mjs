import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  BRAND_MEMORY_MODES,
  createBrandPreferenceFitMemoryJourney,
} from '../brand-preference-fit-memory-journey.mjs';

const route = readFileSync(
  new URL('../../brand-preference-fit-memory-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty, fixture-only, collection-free, and commerce-disabled', () => {
  const view = createBrandPreferenceFitMemoryJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.commerceActionsAvailable, false);
  assert.equal(view.behaviorCollectionAvailable, false);
  assert.equal(view.networkActionsAvailable, false);
  assert.deepEqual(view.supportedModes, [...BRAND_MEMORY_MODES]);
});

test('baseline keeps explicit and inferred roles visibly distinct', () => {
  const result = createBrandPreferenceFitMemoryJourney().run().view.result;
  const adidas = result.brands.find(({ brandId }) => brandId === 'adidas');
  const dickies = result.brands.find(({ brandId }) => brandId === 'dickies');
  assert.equal(adidas.roles[0].source, 'explicit-user');
  assert.equal(dickies.roles[0].source, 'inferred');
  assert.equal(dickies.roles[0].confidence, 0.88);
});

test('correction removes avoidance and outranks inference', () => {
  const journey = createBrandPreferenceFitMemoryJourney();
  journey.selectMode('corrected-avoidance');
  const brand = journey.run().view.result.brands[0];
  assert.equal(brand.status, 'eligible');
  assert.deepEqual(brand.roles.map(({ role, source }) => ({ role, source })), [{
    role: 'favorite',
    source: 'explicit-correction',
  }]);
});

test('later correction reverses earlier role without stale memory', () => {
  const journey = createBrandPreferenceFitMemoryJourney();
  journey.selectMode('reversed-correction');
  const result = journey.run().view.result;
  assert.deepEqual(result.brands, []);
  assert.deepEqual(result.conflicts, []);
});

test('avoidance and conflicts cannot influence recommendations', () => {
  const journey = createBrandPreferenceFitMemoryJourney();
  journey.selectMode('avoided-brand');
  const avoided = journey.run().view.result.brands[0];
  assert.equal(avoided.status, 'excluded');
  assert.equal(avoided.recommendationInfluence, 'none');
  journey.selectMode('review-required');
  const conflicted = journey.run().view.result;
  assert.equal(conflicted.status, 'review-required');
  assert.equal(conflicted.brands[0].recommendationInfluence, 'none');
  assert.equal(conflicted.conflicts.length, 1);
});

test('low-confidence inference remains absent', () => {
  const journey = createBrandPreferenceFitMemoryJourney();
  journey.selectMode('low-confidence');
  assert.deepEqual(journey.run().view.result.brands, []);
});

test('fit memory remains minimized and policy is fixed', () => {
  const result = createBrandPreferenceFitMemoryJourney().run().view.result;
  const clarks = result.brands.find(({ brandId }) => brandId === 'clarks');
  assert.deepEqual(clarks.fitMemory, [{
    itemId: 'owned-clarks-wallabee',
    category: 'footwear',
    size: 'US 10',
    outcome: 'as-preferred',
    source: 'explicit-user',
  }]);
  assert.equal(result.policy.preferenceMayOverrideQualityOrFit, false);
  assert.equal(result.policy.commercialInfluenceAllowed, false);
});

test('changing mode and reset clear prior results', () => {
  const journey = createBrandPreferenceFitMemoryJourney();
  journey.run();
  journey.selectMode('review-required');
  assert.equal(journey.getView().result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'explicit-and-inferred');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createBrandPreferenceFitMemoryJourney().selectMode('track-my-shopping').error,
    'unsupported-brand-memory-mode',
  );
});

test('journey output excludes private behavior and commerce data', () => {
  const serialized = JSON.stringify(createBrandPreferenceFitMemoryJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /browsing|wearLedger|purchaseHistory|returnHistory|privateNote|accountId|affiliate|commission|retailer|price|popularity/i,
  );
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_brand_memory'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html')
      && name !== 'brand-preference-fit-memory-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('brand-preference-fit-memory-fixture.dc.html'));
  assert.deepEqual(references, []);
});

test('route has no network, collection, commerce, or accessibility regressions', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account|camera|upload|track)"/);
  assert.match(route, /Commercial influence, affiliate economics, popularity, and retailer preference are unavailable/);
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
});
