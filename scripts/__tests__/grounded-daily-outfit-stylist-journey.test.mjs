import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  GROUNDED_DAILY_OUTFIT_STYLIST_MODES,
  createGroundedDailyOutfitStylistJourney,
} from '../grounded-daily-outfit-stylist-journey.mjs';

const route = readFileSync(
  new URL('../../grounded-daily-outfit-stylist-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty with minimized context and no live capability', () => {
  const view = createGroundedDailyOutfitStylistJourney().getView();
  assert.equal(view.response, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.providerMode, 'fixture-only-no-network');
  assert.deepEqual(view.supportedModes, [...GROUNDED_DAILY_OUTFIT_STYLIST_MODES]);
  for (const capability of [
    'liveContextAvailable',
    'privateDataAvailable',
    'persistenceAvailable',
    'providerCallsAvailable',
    'networkActionsAvailable',
    'commerceActionsAvailable',
    'externalActionsAvailable',
  ]) assert.equal(view[capability], false);
});

test('every accepted mode becomes a grounded response without recreating policy', () => {
  const journey = createGroundedDailyOutfitStylistJourney();
  const expected = {
    'ready-two': ['answer', 2, 0],
    'ready-three': ['answer', 3, 0],
    'unknown-weather': ['review-required', 0, 0],
    'ambiguous-dress-code': ['review-required', 0, 0],
    'stale-availability': ['review-required', 0, 0],
    'weather-season-conflict': ['abstain', 0, 0],
    'dress-code-occasion-conflict': ['abstain', 0, 0],
    'outfit-set-boundary-tie': ['review-required', 0, 3],
    'insufficient-candidates': ['abstain', 0, 0],
  };
  for (const [mode, [outcome, selected, tied]] of Object.entries(expected)) {
    assert.equal(journey.selectMode(mode).ok, true);
    const result = journey.run();
    assert.equal(result.ok, true);
    assert.equal(result.view.response.outcome, outcome);
    assert.equal(result.view.response.selectedOutfitIds.length, selected);
    assert.equal(result.view.response.tiedOutfitIds.length, tied);
    assert.ok(result.view.response.title.length > 0);
    assert.ok(result.view.response.summary.length > 0);
    assert.ok(result.view.response.reasonCodes.length > 0);
    assert.ok(result.view.response.citations.length > 0);
    assert.ok(result.view.response.limitations.length > 0);
    assert.ok(result.view.response.nextStep.length > 0);
  }
});

test('response keeps context, uncertainty, policy, citations, and minimized evidence visible', () => {
  const journey = createGroundedDailyOutfitStylistJourney();
  journey.selectMode('insufficient-candidates');
  const response = journey.run().view.response;
  assert.equal(response.context.occasion, 'everyday');
  assert.equal(response.uncertainty.level, 'high');
  assert.equal(response.policy.sourceRankingReused, true);
  assert.equal(response.policy.providerCallsAllowed, false);
  assert.equal(response.policy.commercialInfluenceAllowed, false);
  assert.equal(response.outfitEvidence.length, 2);
  assert.equal(
    response.outfitEvidence.filter(({ status }) => status === 'excluded').length,
    1,
  );
  assert.equal(response.citations.length, 2);
});

test('mode changes invalidate prior responses and reset restores focusable defaults', () => {
  const journey = createGroundedDailyOutfitStylistJourney();
  journey.run();
  assert.notEqual(journey.getView().response, null);
  const changed = journey.selectMode('unknown-weather');
  assert.equal(changed.view.response, null);
  assert.equal(changed.view.context.weatherClass, 'unknown');
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'ready-two');
  assert.equal(reset.view.context.weatherClass, 'dry');
  assert.equal(reset.view.response, null);
});

test('unsupported modes fail closed', () => {
  assert.deepEqual(
    createGroundedDailyOutfitStylistJourney().selectMode('live-weather'),
    { ok: false, error: 'unsupported-daily-outfit-mode' },
  );
});

test('journey output excludes live, private, commercial, and action data', () => {
  const serialized = JSON.stringify(
    createGroundedDailyOutfitStylistJourney().run().view,
  );
  assert.doesNotMatch(
    serialized,
    /latitude|longitude|calendar|itinerary|privateNote|browsing|purchase|return|price|retailer|affiliate|commission|checkout|account|accessToken/i,
  );
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_grounded_daily_stylist'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html')
      && name !== 'grounded-daily-outfit-stylist-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('grounded-daily-outfit-stylist-fixture.dc.html'));
  assert.deepEqual(references, []);
});

test('route renders the complete accepted response projection', () => {
  for (const id of [
    'response-outcome',
    'response-title',
    'response-summary',
    'context',
    'selected',
    'tied',
    'qualified',
    'reason-codes',
    'uncertainty',
    'citations',
    'limitations',
    'next-step',
    'policy',
    'outfit-evidence',
  ]) assert.match(route, new RegExp(`id="${id}"`));
});

test('route has no network, private-data, commerce, or external-action controls', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|geolocation|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account|camera|upload|track|save|publish|message)"/);
  assert.match(route, /External actions:<\/strong> unavailable/);
});

test('route keeps focus, 44px controls, and responsive containment safeguards', () => {
  assert.match(route, /mode\.focus\(\)/);
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
  assert.match(route, /overflow-wrap:anywhere/);
});
