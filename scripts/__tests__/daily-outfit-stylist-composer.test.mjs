import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  COMPOSER_OCCASIONS,
  COMPOSER_SEASON_CLASSES,
  COMPOSER_WEATHER_CLASSES,
  COMPOSER_DRESS_CODES,
  COMPOSER_AVAILABILITY_WINDOWS,
  COMPOSER_DESIRED_COUNTS,
  createDailyOutfitStylistComposer,
} from '../daily-outfit-stylist-composer.mjs';

const route = readFileSync(
  new URL('../../daily-outfit-stylist-composer-fixture.dc.html', import.meta.url),
  'utf8',
);

test('composer starts with deterministic defaults, no response, and no live capability', () => {
  const view = createDailyOutfitStylistComposer().getView();
  assert.deepEqual(view.context, {
    occasion: 'everyday',
    seasonClass: 'transitional',
    weatherClass: 'dry',
    dressCode: 'smart-casual',
    availabilityWindow: 'today',
    desiredCount: 2,
  });
  assert.equal(view.response, null);
  assert.equal(view.clarificationPrompt, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.providerMode, 'fixture-only-no-network');
  assert.equal(view.candidatePoolSize, 4);
  assert.equal(view.candidatePoolIsSynthetic, true);
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

test('allowlist exposes only the exact accepted domain values', () => {
  const view = createDailyOutfitStylistComposer().getView();
  assert.deepEqual(view.allowlist.occasion, [...COMPOSER_OCCASIONS]);
  assert.deepEqual(view.allowlist.seasonClass, [...COMPOSER_SEASON_CLASSES]);
  assert.deepEqual(view.allowlist.weatherClass, [...COMPOSER_WEATHER_CLASSES]);
  assert.deepEqual(view.allowlist.dressCode, [...COMPOSER_DRESS_CODES]);
  assert.deepEqual(view.allowlist.availabilityWindow, [...COMPOSER_AVAILABILITY_WINDOWS]);
  assert.deepEqual(view.allowlist.desiredCount, [...COMPOSER_DESIRED_COUNTS]);
});

test('unsupported fields and out-of-allowlist values fail closed', () => {
  const composer = createDailyOutfitStylistComposer();
  assert.deepEqual(
    composer.selectField('freeText', 'anything'),
    { ok: false, error: 'unsupported-daily-outfit-stylist-composer-field' },
  );
  assert.deepEqual(
    composer.selectField('occasion', 'party'),
    { ok: false, error: 'unsupported-daily-outfit-stylist-composer-field' },
  );
  assert.deepEqual(
    composer.selectField('desiredCount', 4),
    { ok: false, error: 'unsupported-daily-outfit-stylist-composer-field' },
  );
  assert.equal(composer.getView().context.occasion, 'everyday');
});

test('a coherent default context answers with exactly two selected outfits', () => {
  const composer = createDailyOutfitStylistComposer();
  const run = composer.run();
  assert.equal(run.ok, true);
  const response = run.view.response;
  assert.equal(response.outcome, 'answer');
  assert.equal(response.selectedOutfitIds.length, 2);
  assert.equal(response.tiedOutfitIds.length, 0);
  assert.equal(run.view.clarificationPrompt, null);
  assert.ok(response.title.length > 0);
  assert.ok(response.summary.length > 0);
  assert.ok(response.citations.length > 0);
  assert.ok(response.limitations.length > 0);
  assert.ok(response.nextStep.length > 0);
});

test('choosing three outfits answers with exactly three selected outfits', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.selectField('desiredCount', 3);
  const run = composer.run();
  assert.equal(run.ok, true);
  assert.equal(run.view.response.outcome, 'answer');
  assert.equal(run.view.response.selectedOutfitIds.length, 3);
  assert.equal(run.view.response.tiedOutfitIds.length, 0);
  assert.equal(run.view.clarificationPrompt, null);
});

test('unknown weather stays an honest review-required non-answer with a clarification prompt', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.selectField('weatherClass', 'unknown');
  const run = composer.run();
  const response = run.view.response;
  assert.equal(response.outcome, 'review-required');
  assert.equal(response.selectedOutfitIds.length, 0);
  assert.match(run.view.clarificationPrompt, /unknown, ambiguous, or stale/);
  assert.match(run.view.clarificationPrompt, /weather-class-unknown/);
});

test('ambiguous dress code and stale availability stay review-required', () => {
  for (const [field, value] of [['dressCode', 'ambiguous'], ['availabilityWindow', 'stale']]) {
    const composer = createDailyOutfitStylistComposer();
    composer.selectField(field, value);
    const response = composer.run().view.response;
    assert.equal(response.outcome, 'review-required');
    assert.equal(response.outfitEvidence.length, 0);
  }
});

test('a conflicting season and weather selection abstains instead of guessing', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.selectField('seasonClass', 'warm');
  composer.selectField('weatherClass', 'cold');
  const run = composer.run();
  const response = run.view.response;
  assert.equal(response.outcome, 'abstain');
  assert.deepEqual(response.reasonCodes, ['warm-season-conflicts-with-cold-weather']);
  assert.match(run.view.clarificationPrompt, /conflict/);
});

test('a formal dress code conflicting with the occasion abstains', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.selectField('dressCode', 'formal');
  const response = composer.run().view.response;
  assert.equal(response.outcome, 'abstain');
  assert.deepEqual(response.reasonCodes, ['formal-dress-code-conflicts-with-occasion']);
});

test('a coherent formal dinner selection still answers', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.selectField('occasion', 'dinner');
  composer.selectField('dressCode', 'formal');
  const response = composer.run().view.response;
  assert.equal(response.outcome, 'answer');
  assert.equal(response.selectedOutfitIds.length, 2);
});

test('changing a field after a response invalidates the prior response', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.run();
  assert.notEqual(composer.getView().response, null);
  const changed = composer.selectField('weatherClass', 'unknown');
  assert.equal(changed.view.response, null);
  assert.equal(changed.view.clarificationPrompt, null);
  assert.equal(changed.view.context.weatherClass, 'unknown');
});

test('reset restores deterministic defaults and clears any prior response', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.selectField('occasion', 'travel');
  composer.selectField('desiredCount', 3);
  composer.run();
  const reset = composer.reset();
  assert.equal(reset.view.response, null);
  assert.equal(reset.view.clarificationPrompt, null);
  assert.deepEqual(reset.view.context, {
    occasion: 'everyday',
    seasonClass: 'transitional',
    weatherClass: 'dry',
    dressCode: 'smart-casual',
    availabilityWindow: 'today',
    desiredCount: 2,
  });
});

test('the synthetic candidate pool is closed and deterministic across occasions', () => {
  const first = createDailyOutfitStylistComposer();
  const second = createDailyOutfitStylistComposer();
  second.selectField('occasion', 'travel');
  const firstIds = first.run().view.response.qualifiedOutfitIds.slice().sort();
  const secondIds = second.run().view.response.qualifiedOutfitIds.slice().sort();
  assert.deepEqual(firstIds, secondIds);
  assert.equal(firstIds.length, 4);
});

test('composer output excludes live, private, commercial, and action data', () => {
  const composer = createDailyOutfitStylistComposer();
  composer.run();
  const serialized = JSON.stringify(composer.getView());
  assert.doesNotMatch(
    serialized,
    /latitude|longitude|calendar|itinerary|privateNote|browsing|purchase|return|price|retailer|affiliate|commission|checkout|account|accessToken/i,
  );
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_daily_stylist_composer'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html')
      && name !== 'daily-outfit-stylist-composer-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('daily-outfit-stylist-composer-fixture.dc.html'));
  assert.deepEqual(references, []);
});

test('route has no free-text or hidden collection field', () => {
  assert.doesNotMatch(route, /<input\b/i);
  assert.doesNotMatch(route, /<textarea\b/i);
  const selectCount = (route.match(/<select\b/gi) || []).length;
  assert.equal(selectCount, 6);
});

test('route renders every field and the complete accepted response projection', () => {
  for (const id of [
    'occasion',
    'seasonClass',
    'weatherClass',
    'dressCode',
    'availabilityWindow',
    'desiredCount',
    'response-outcome',
    'response-title',
    'response-summary',
    'clarification-prompt',
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
  assert.match(route, /fields\[0\]\.focus\(\)/);
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
  assert.match(route, /overflow-wrap:anywhere/);
});
