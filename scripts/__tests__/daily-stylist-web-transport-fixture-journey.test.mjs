import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS,
  createDailyStylistWebTransportFixtureJourney,
} from '../daily-stylist-web-transport-fixture-journey.mjs';
import {
  FIXTURE_PROFILE,
  FIXTURE_WARDROBE,
} from '../__fixtures__/personalization.mjs';

const route = readFileSync(
  new URL('../../daily-stylist-web-transport-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts on ready with no result and no external capability', () => {
  const view = createDailyStylistWebTransportFixtureJourney().getView();
  assert.equal(view.scenario, 'ready');
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.deepEqual(view.supportedScenarios, [...DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS]);
  assert.ok(view.transportCheckSummary);
  assert.equal(view.liveContextAvailable, false);
  assert.equal(view.privateDataAvailable, false);
  assert.equal(view.persistenceAvailable, false);
  assert.equal(view.networkActionsAvailable, false);
  assert.equal(view.commerceActionsAvailable, false);
  assert.equal(view.externalActionsAvailable, false);
});

test('a ready scenario produces the ready client status with the unmodified Grounded Stylist response', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  const view = journey.run().view;
  assert.equal(view.result.status, 'ready');
  assert.equal(view.result.requestId, 'req-fixture-01');
  assert.equal(view.result.response.outcome, 'answer');
});

test('unknown-context and exact-tie scenarios both produce the review-required client status', () => {
  for (const scenarioKey of ['review-required-unknown-context', 'exact-tie']) {
    const journey = createDailyStylistWebTransportFixtureJourney();
    journey.selectScenario(scenarioKey);
    const view = journey.run().view;
    assert.equal(view.result.status, 'review-required');
    assert.equal(view.result.response.outcome, 'review-required');
  }
});

test('a conflicting context scenario produces the abstained client status', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  journey.selectScenario('abstained-conflicting-context');
  const view = journey.run().view;
  assert.equal(view.result.status, 'abstained');
  assert.equal(view.result.response.outcome, 'abstain');
});

const TRANSPORT_REJECTION_SCENARIOS = ['non-post', 'non-json', 'unverified-same-origin', 'failed-csrf'];

test('transport-level defects are rejected before the service seam runs, echoing the trusted request ID', () => {
  for (const scenarioKey of TRANSPORT_REJECTION_SCENARIOS) {
    const journey = createDailyStylistWebTransportFixtureJourney();
    journey.selectScenario(scenarioKey);
    const view = journey.run().view;
    assert.equal(view.result.status, 'request-rejected');
    assert.equal(view.result.requestId, 'req-fixture-01');
    assert.equal(view.result.response, null);
  }
});

test('a request-ID mismatch is rejected and echoes only the trusted middleware ID', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  journey.selectScenario('request-id-mismatch');
  const view = journey.run().view;
  assert.equal(view.result.status, 'request-rejected');
  assert.equal(view.result.requestId, 'req-trusted-middleware-01');
  assert.equal(view.result.response, null);
});

test('an invalid browser-supplied request ID is never reflected in the rejected response', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  journey.selectScenario('invalid-request-id');
  const view = journey.run().view;
  assert.equal(view.result.status, 'request-rejected');
  assert.equal(view.result.requestId, null);
  assert.equal(JSON.stringify(view).includes('browser-supplied-value-do-not-echo'), false);
});

const STOPPED_SCENARIOS = [
  ['missing-session', 'unauthenticated'],
  ['expired-session', 'unauthenticated'],
  ['missing-scope', 'unauthorized'],
  ['cross-account-access', 'unauthorized'],
  ['revoked-consent', 'consent-required'],
  ['unresolved-profile', 'unresolved-context'],
  ['unresolved-snapshot', 'stale-snapshot'],
  ['stale-snapshot', 'stale-snapshot'],
  ['insufficient-evidence', 'insufficient-candidates'],
  ['service-unavailable', 'service-unavailable'],
];

for (const [scenarioKey, expectedStatus] of STOPPED_SCENARIOS) {
  test(`${scenarioKey} maps to the ${expectedStatus} client status with no response payload`, () => {
    const journey = createDailyStylistWebTransportFixtureJourney();
    journey.selectScenario(scenarioKey);
    const view = journey.run().view;
    assert.equal(view.result.status, expectedStatus);
    assert.equal(view.result.response, null);
  });
}

test('insufficient evidence asks the client to review wardrobe evidence, never to buy or add clothing', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  journey.selectScenario('insufficient-evidence');
  const view = journey.run().view;
  assert.equal(view.result.nextStep, 'review-wardrobe-evidence');
  assert.equal(view.result.response, null);
  const serialized = JSON.stringify(view.result);
  assert.doesNotMatch(serialized, /\bbuy\b|\badd-clothing\b|\bpurchase\b/i);
});

test('an unresolved profile and an unresolved wardrobe snapshot both stop with no existence oracle', () => {
  const profileJourney = createDailyStylistWebTransportFixtureJourney();
  profileJourney.selectScenario('unresolved-profile');
  const profileView = profileJourney.run().view;

  const snapshotJourney = createDailyStylistWebTransportFixtureJourney();
  snapshotJourney.selectScenario('unresolved-snapshot');
  const snapshotView = snapshotJourney.run().view;

  assert.equal(profileView.result.status, 'unresolved-context');
  assert.equal(snapshotView.result.status, 'stale-snapshot');
  assert.equal(profileView.result.response, null);
  assert.equal(snapshotView.result.response, null);
});

test('scenario changes and reset clear the prior result and restore the deterministic default', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  journey.run();
  const changed = journey.selectScenario('missing-session');
  assert.equal(changed.view.result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.scenario, 'ready');
  assert.equal(reset.view.result, null);
});

test('unsupported scenarios fail closed', () => {
  assert.equal(
    createDailyStylistWebTransportFixtureJourney().selectScenario('live-session').error,
    'unsupported-daily-stylist-web-transport-fixture-scenario',
  );
});

test('identical accepted scenario input produces a byte-stable result for both completed and stopped outcomes', () => {
  const firstReady = JSON.stringify(createDailyStylistWebTransportFixtureJourney().run().view.result);
  const secondReady = JSON.stringify(createDailyStylistWebTransportFixtureJourney().run().view.result);
  assert.equal(firstReady, secondReady);

  const firstStopped = JSON.stringify(
    (() => {
      const journey = createDailyStylistWebTransportFixtureJourney();
      journey.selectScenario('cross-account-access');
      return journey.run().view.result;
    })(),
  );
  const secondStopped = JSON.stringify(
    (() => {
      const journey = createDailyStylistWebTransportFixtureJourney();
      journey.selectScenario('cross-account-access');
      return journey.run().view.result;
    })(),
  );
  assert.equal(firstStopped, secondStopped);
});

test('journey output excludes the session, raw profile, wardrobe payload, and consent record', () => {
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
  for (const scenarioKey of DAILY_STYLIST_WEB_TRANSPORT_FIXTURE_SCENARIOS) {
    const journey = createDailyStylistWebTransportFixtureJourney();
    journey.selectScenario(scenarioKey);
    const serialized = JSON.stringify(journey.run().view);
    for (const value of forbiddenValues) {
      assert.equal(serialized.includes(value), false, `unexpected leak of "${value}" in scenario ${scenarioKey}`);
    }
  }
});

test('journey output never carries the internal step trace or a raw seam reason code', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  journey.selectScenario('missing-session');
  const serialized = JSON.stringify(journey.run().view);
  assert.equal(serialized.includes('"trace"'), false);
  assert.equal(serialized.includes('"reasonCode"'), false);
  assert.equal(serialized.includes('"stoppedAtStep"'), false);
  assert.equal(serialized.includes('session-not-authenticated'), false);
});

test('journey output carries no commercial, credential, or external-action field', () => {
  const journey = createDailyStylistWebTransportFixtureJourney();
  const serialized = JSON.stringify(journey.run().view);
  for (const forbiddenKey of ['price', 'affiliateUrl', 'commissionRate', 'apiKey', 'secret', 'purchase', 'notify', 'publish']) {
    assert.equal(serialized.includes(`"${forbiddenKey}"`), false, `unexpected key "${forbiddenKey}"`);
  }
  assert.equal(journey.getView().result.response.policy.commercialInfluenceAllowed, false);
  assert.equal(journey.getView().result.response.policy.externalActionsAllowed, false);
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_daily_stylist_web_transport'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html') && name !== 'daily-stylist-web-transport-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('daily-stylist-web-transport-fixture.dc.html'));
  assert.deepEqual(references, []);
  const sitemap = readFileSync(new URL('../../sitemap.xml', import.meta.url), 'utf8');
  assert.equal(sitemap.includes('daily-stylist-web-transport-fixture.dc.html'), false);
});

test('route renders only the accepted client response and the transport-check summary, never the seam trace or session', () => {
  assert.doesNotMatch(route, /\bview\.result\.trace\b/);
  assert.doesNotMatch(route, /\bsession\b\s*:/);
  assert.doesNotMatch(route, /stoppedAtStep/);
  assert.match(route, /transport-summary/);
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
