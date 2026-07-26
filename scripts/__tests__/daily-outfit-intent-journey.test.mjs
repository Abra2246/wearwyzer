import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  DAILY_OUTFIT_MODES,
  createDailyOutfitIntentJourney,
} from '../daily-outfit-intent-journey.mjs';

const route = readFileSync(
  new URL('../../daily-outfit-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty with minimized explicit context and no external capability', () => {
  const view = createDailyOutfitIntentJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.context.desiredCount, 2);
  assert.equal(view.liveContextAvailable, false);
  assert.equal(view.privateDataAvailable, false);
  assert.equal(view.persistenceAvailable, false);
  assert.equal(view.networkActionsAvailable, false);
  assert.equal(view.commerceActionsAvailable, false);
  assert.deepEqual(view.supportedModes, [...DAILY_OUTFIT_MODES]);
});

test('ready two and three outfit modes delegate complete sets', () => {
  const journey = createDailyOutfitIntentJourney();
  let result = journey.run().view.result;
  assert.equal(result.status, 'ready');
  assert.equal(result.outfitSet.status, 'recommended-set');
  assert.equal(result.outfitSet.selectedOutfitIds.length, 2);
  journey.selectMode('ready-three');
  result = journey.run().view.result;
  assert.equal(result.status, 'ready');
  assert.equal(result.outfitSet.desiredCount, 3);
  assert.equal(result.outfitSet.selectedOutfitIds.length, 3);
});

test('unknown, ambiguous, and stale context remain review-required without set evaluation', () => {
  const journey = createDailyOutfitIntentJourney();
  const expected = {
    'unknown-weather': 'weather-class-unknown',
    'ambiguous-dress-code': 'dress-code-ambiguous',
    'stale-availability': 'availability-evidence-stale',
  };
  for (const [mode, reason] of Object.entries(expected)) {
    journey.selectMode(mode);
    const result = journey.run().view.result;
    assert.equal(result.status, 'review-required');
    assert.equal(result.outfitSet, null);
    assert.ok(result.reasonCodes.includes(reason));
  }
});

test('contradictory context abstains with explicit reasons', () => {
  const journey = createDailyOutfitIntentJourney();
  const expected = {
    'weather-season-conflict': 'warm-season-conflicts-with-cold-weather',
    'dress-code-occasion-conflict': 'formal-dress-code-conflicts-with-occasion',
  };
  for (const [mode, reason] of Object.entries(expected)) {
    journey.selectMode(mode);
    const result = journey.run().view.result;
    assert.equal(result.status, 'abstained');
    assert.equal(result.outfitSet, null);
    assert.ok(result.reasonCodes.includes(reason));
  }
});

test('Outfit Set tie stays review-required and insufficiency abstains', () => {
  const journey = createDailyOutfitIntentJourney();
  journey.selectMode('outfit-set-boundary-tie');
  let result = journey.run().view.result;
  assert.equal(result.status, 'review-required');
  assert.equal(result.outfitSet.status, 'tie-review');
  assert.equal(result.outfitSet.tiedOutfitIds.length, 3);
  journey.selectMode('insufficient-candidates');
  result = journey.run().view.result;
  assert.equal(result.status, 'abstained');
  assert.equal(result.outfitSet.status, 'insufficient-candidates');
});

test('mode changes and reset clear prior results and restore deterministic defaults', () => {
  const journey = createDailyOutfitIntentJourney();
  journey.run();
  const changed = journey.selectMode('unknown-weather');
  assert.equal(changed.view.result, null);
  assert.equal(changed.view.context.weatherClass, 'unknown');
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'ready-two');
  assert.equal(reset.view.context.weatherClass, 'dry');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createDailyOutfitIntentJourney().selectMode('live-weather').error,
    'unsupported-daily-outfit-mode',
  );
});

test('journey output excludes live context, private records, persistence, and commerce', () => {
  const serialized = JSON.stringify(createDailyOutfitIntentJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /latitude|longitude|calendar|itinerary|privateNote|browsing|purchase|return|price|retailer|affiliate|commission|checkout|account/i,
  );
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_daily_outfit'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html') && name !== 'daily-outfit-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('daily-outfit-fixture.dc.html'));
  assert.deepEqual(references, []);
});

test('route has no network, private-data, commerce, or accessibility regressions', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|geolocation|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account|camera|upload|track|save)"/);
  assert.match(route, /External actions:<\/strong> unavailable/);
  assert.match(route, /mode\.focus\(\)/);
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
});
