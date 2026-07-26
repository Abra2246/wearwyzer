import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  DAILY_STYLIST_SERVICE_SEAM_SCENARIOS,
  createDailyStylistServiceSeamJourney,
} from '../daily-stylist-service-seam-journey.mjs';
import { RESOLUTION_STEPS } from '../daily-stylist-production-boundary-contract.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
} from '../__fixtures__/personalization.mjs';

const route = readFileSync(
  new URL('../../daily-stylist-service-seam-fixture.dc.html', import.meta.url),
  'utf8',
);
const STEP_ORDER = RESOLUTION_STEPS.map((entry) => entry.step);

test('journey starts on ready-success with no result, a fixed step list, and no external capability', () => {
  const view = createDailyStylistServiceSeamJourney().getView();
  assert.equal(view.scenario, 'ready-success');
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.deepEqual(view.steps.map((row) => row.step), STEP_ORDER);
  assert.ok(view.steps.every((row) => row.status === 'not-executed'));
  assert.deepEqual(view.supportedScenarios, [...DAILY_STYLIST_SERVICE_SEAM_SCENARIOS]);
  assert.equal(view.liveContextAvailable, false);
  assert.equal(view.privateDataAvailable, false);
  assert.equal(view.persistenceAvailable, false);
  assert.equal(view.networkActionsAvailable, false);
  assert.equal(view.commerceActionsAvailable, false);
  assert.equal(view.externalActionsAvailable, false);
});

test('a ready success scenario executes every step and returns a grounded answer', () => {
  const journey = createDailyStylistServiceSeamJourney();
  const view = journey.run().view;
  assert.equal(view.result.outcome, 'completed');
  assert.equal(view.result.stoppedAtStep, null);
  assert.equal(view.result.response.outcome, 'answer');
  assert.ok(view.steps.every((row) => row.status === 'passed'));
});

test('missing and expired sessions stop at authenticate-session with every later step not-executed', () => {
  for (const scenarioKey of ['missing-session', 'expired-session']) {
    const journey = createDailyStylistServiceSeamJourney();
    journey.selectScenario(scenarioKey);
    const view = journey.run().view;
    assert.equal(view.result.outcome, 'stopped');
    assert.equal(view.result.stoppedAtStep, 'authenticate-session');
    assert.equal(view.result.reasonCode, 'session-not-authenticated');
    assert.equal(view.result.response, null);
    assert.equal(view.steps[0].status, 'failed');
    assert.ok(view.steps.slice(1).every((row) => row.status === 'not-executed'));
  }
});

test('missing scope and cross-account access both stop at authorize-same-account-ownership after authentication passes', () => {
  for (const scenarioKey of ['missing-personalization-scope', 'cross-account-access']) {
    const journey = createDailyStylistServiceSeamJourney();
    journey.selectScenario(scenarioKey);
    const view = journey.run().view;
    assert.equal(view.result.stoppedAtStep, 'authorize-same-account-ownership');
    assert.equal(view.result.reasonCode, 'cross-account-access-denied');
    assert.equal(view.steps[0].status, 'passed');
    assert.equal(view.steps[1].status, 'failed');
    assert.ok(view.steps.slice(2).every((row) => row.status === 'not-executed'));
  }
});

test('revoked consent stops at verify-active-personalization-consent after ownership passes', () => {
  const journey = createDailyStylistServiceSeamJourney();
  journey.selectScenario('revoked-consent');
  const view = journey.run().view;
  assert.equal(view.result.stoppedAtStep, 'verify-active-personalization-consent');
  assert.equal(view.result.reasonCode, 'personalization-consent-revoked-or-missing');
  assert.deepEqual(view.steps.slice(0, 2).map((row) => row.status), ['passed', 'passed']);
  assert.equal(view.steps[2].status, 'failed');
  assert.ok(view.steps.slice(3).every((row) => row.status === 'not-executed'));
});

test('an unresolved profile reference stops at resolve-profile-reference after ownership and consent pass', () => {
  const journey = createDailyStylistServiceSeamJourney();
  journey.selectScenario('unresolved-profile');
  const view = journey.run().view;
  assert.equal(view.result.stoppedAtStep, 'resolve-profile-reference');
  assert.equal(view.result.reasonCode, 'profile-reference-unresolved');
  assert.deepEqual(view.steps.slice(0, 3).map((row) => row.status), ['passed', 'passed', 'passed']);
  assert.equal(view.steps[3].status, 'failed');
  assert.ok(view.steps.slice(4).every((row) => row.status === 'not-executed'));
});

test('an unresolved and a stale wardrobe snapshot both stop at verify-wardrobe-snapshot-current after the profile resolves', () => {
  for (const scenarioKey of ['unresolved-wardrobe-snapshot', 'stale-snapshot']) {
    const journey = createDailyStylistServiceSeamJourney();
    journey.selectScenario(scenarioKey);
    const view = journey.run().view;
    assert.equal(view.result.stoppedAtStep, 'verify-wardrobe-snapshot-current');
    assert.equal(view.result.reasonCode, 'wardrobe-snapshot-stale-or-unresolved');
    assert.deepEqual(view.steps.slice(0, 4).map((row) => row.status), ['passed', 'passed', 'passed', 'passed']);
    assert.equal(view.steps[4].status, 'failed');
    assert.ok(view.steps.slice(5).every((row) => row.status === 'not-executed'));
  }
});

test('insufficient fixture candidates stops at derive-minimized-outfit-candidates before Daily Outfit Intent runs', () => {
  const journey = createDailyStylistServiceSeamJourney();
  journey.selectScenario('insufficient-candidates');
  const view = journey.run().view;
  assert.equal(view.result.stoppedAtStep, 'derive-minimized-outfit-candidates');
  assert.equal(view.result.reasonCode, 'insufficient-minimized-candidates');
  assert.deepEqual(view.steps.slice(0, 5).map((row) => row.status), ['passed', 'passed', 'passed', 'passed', 'passed']);
  assert.equal(view.steps[5].status, 'failed');
  assert.ok(view.steps.slice(6).every((row) => row.status === 'not-executed'));
});

test('unknown-context review, contradictory abstention, and an exact tie all complete every step as honest non-answers', () => {
  const journey = createDailyStylistServiceSeamJourney();
  journey.selectScenario('unknown-context-review');
  let view = journey.run().view;
  assert.equal(view.result.outcome, 'completed');
  assert.equal(view.result.response.outcome, 'review-required');
  assert.ok(view.steps.every((row) => row.status === 'passed'));

  journey.selectScenario('contradictory-context-abstention');
  view = journey.run().view;
  assert.equal(view.result.outcome, 'completed');
  assert.equal(view.result.response.outcome, 'abstain');
  assert.ok(view.steps.every((row) => row.status === 'passed'));

  journey.selectScenario('exact-selection-boundary-tie');
  view = journey.run().view;
  assert.equal(view.result.outcome, 'completed');
  assert.equal(view.result.response.outcome, 'review-required');
  assert.equal(view.result.response.tiedOutfitIds.length, 3);
  assert.equal(view.result.response.selectedOutfitIds.length, 0);
  assert.ok(view.steps.every((row) => row.status === 'passed'));
});

test('scenario changes and reset clear prior results and restore deterministic defaults and step state', () => {
  const journey = createDailyStylistServiceSeamJourney();
  journey.run();
  const changed = journey.selectScenario('missing-session');
  assert.equal(changed.view.result, null);
  assert.ok(changed.view.steps.every((row) => row.status === 'not-executed'));
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.scenario, 'ready-success');
  assert.equal(reset.view.result, null);
  assert.ok(reset.view.steps.every((row) => row.status === 'not-executed'));
});

test('unsupported scenarios fail closed', () => {
  assert.equal(
    createDailyStylistServiceSeamJourney().selectScenario('live-session').error,
    'unsupported-daily-stylist-service-seam-scenario',
  );
});

test('identical accepted scenario input produces a byte-stable minimized result', () => {
  const first = JSON.stringify(createDailyStylistServiceSeamJourney().run().view.result);
  const second = JSON.stringify(createDailyStylistServiceSeamJourney().run().view.result);
  assert.equal(first, second);

  const firstStopped = JSON.stringify(
    (() => {
      const journey = createDailyStylistServiceSeamJourney();
      journey.selectScenario('cross-account-access');
      return journey.run().view.result;
    })(),
  );
  const secondStopped = JSON.stringify(
    (() => {
      const journey = createDailyStylistServiceSeamJourney();
      journey.selectScenario('cross-account-access');
      return journey.run().view.result;
    })(),
  );
  assert.equal(firstStopped, secondStopped);
});

test('journey output excludes the session, raw profile, wardrobe payload, and consent record', () => {
  const journey = createDailyStylistServiceSeamJourney();
  const serialized = JSON.stringify(journey.run().view);
  const forbiddenValues = [
    'fixture-session-01',
    'fixture-auth-subject-01',
    'fixture-consent-personalization-01',
    FIXTURE_PROFILE.audience,
    ...FIXTURE_PROFILE.preferredColors,
    ...FIXTURE_PROFILE.preferredAesthetics,
    ...FIXTURE_WARDROBE.map((item) => item.id),
    ...FIXTURE_WARDROBE.map((item) => item.productId),
  ];
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false, `unexpected leak of "${value}"`);
  }
});

test('journey output carries no commercial, credential, or external-action field', () => {
  const journey = createDailyStylistServiceSeamJourney();
  const serialized = JSON.stringify(journey.run().view);
  for (const forbiddenKey of ['price', 'affiliateUrl', 'commissionRate', 'apiKey', 'secret', 'purchase', 'notify', 'publish']) {
    assert.equal(serialized.includes(`"${forbiddenKey}"`), false, `unexpected key "${forbiddenKey}"`);
  }
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_daily_stylist_service_seam'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html') && name !== 'daily-stylist-service-seam-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('daily-stylist-service-seam-fixture.dc.html'));
  assert.deepEqual(references, []);
  const sitemap = readFileSync(new URL('../../sitemap.xml', import.meta.url), 'utf8');
  assert.equal(sitemap.includes('daily-stylist-service-seam-fixture.dc.html'), false);
});

test('route has no network, private-data, commerce, or accessibility regressions', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|geolocation|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account|camera|upload|track|save)"/);
  assert.match(route, /External actions:<\/strong> unavailable/);
  assert.match(route, /scenario\.focus\(\)/);
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
});
