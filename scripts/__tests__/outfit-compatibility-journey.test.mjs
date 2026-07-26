import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  OUTFIT_COMPATIBILITY_MODES,
  createOutfitCompatibilityJourney,
} from '../outfit-compatibility-journey.mjs';

const route = readFileSync(
  new URL('../../outfit-compatibility-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty, fixture-only, private-data-free, and external-action disabled', () => {
  const view = createOutfitCompatibilityJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.commerceActionsAvailable, false);
  assert.equal(view.networkActionsAvailable, false);
  assert.equal(view.privateDataAvailable, false);
  assert.deepEqual(view.supportedModes, [...OUTFIT_COMPATIBILITY_MODES]);
});

test('compatible mode exposes a complete owned-first result', () => {
  const result = createOutfitCompatibilityJourney().run().view.result;
  assert.equal(result.kind, 'single');
  assert.equal(result.data.status, 'compatible');
  assert.ok(result.data.score >= 80);
  assert.equal(result.data.items.filter(({ ownership }) => ownership === 'owned').length, 3);
  assert.equal(result.data.items.filter(({ ownership }) => ownership === 'prospective').length, 1);
});

test('missing evidence requires review without becoming zero', () => {
  const journey = createOutfitCompatibilityJourney();
  journey.selectMode('missing-evidence');
  const result = journey.run().view.result.data;
  assert.equal(result.status, 'review-required');
  assert.equal(result.parts.verifiedFit, null);
  assert.notEqual(result.score, 0);
  assert.ok(result.missingEvidence.includes('prospective-shoe:fit-evidence-unknown'));
});

test('explicit style and conflicting fit remain separate hard blocks', () => {
  const journey = createOutfitCompatibilityJourney();
  journey.selectMode('explicit-style-block');
  const styleBlocked = journey.run().view.result.data;
  assert.equal(styleBlocked.status, 'incompatible');
  assert.ok(styleBlocked.hardIncompatibilities.every((reason) => reason.includes('explicit-negative-palette')));
  journey.selectMode('conflicting-fit');
  const fitBlocked = journey.run().view.result.data;
  assert.equal(fitBlocked.status, 'incompatible');
  assert.ok(fitBlocked.hardIncompatibilities.includes('prospective-shoe:fit-evidence-conflicting'));
});

test('missing required role stays labeled rather than invented', () => {
  const journey = createOutfitCompatibilityJourney();
  journey.selectMode('missing-required-role');
  const result = journey.run().view.result.data;
  assert.equal(result.status, 'incompatible');
  assert.equal(result.items.find(({ role }) => role === 'bottom').ownership, 'missing');
});

test('comparison preserves leader, tie, and none-qualified outcomes', () => {
  const journey = createOutfitCompatibilityJourney();
  const expected = {
    'comparison-leader': 'selected',
    'comparison-tie': 'tie',
    'none-qualified': 'none-qualified',
  };
  for (const [mode, status] of Object.entries(expected)) {
    journey.selectMode(mode);
    const result = journey.run().view.result;
    assert.equal(result.kind, 'comparison');
    assert.equal(result.data.status, status);
  }
});

test('comparison leader and tie keep selected IDs explicit', () => {
  const journey = createOutfitCompatibilityJourney();
  journey.selectMode('comparison-leader');
  assert.deepEqual(journey.run().view.result.data.selectedOutfitIds, ['fixture-outfit-one']);
  journey.selectMode('comparison-tie');
  assert.deepEqual(journey.run().view.result.data.selectedOutfitIds, [
    'fixture-outfit-one',
    'fixture-outfit-tie',
  ]);
});

test('changing mode and reset clear prior results', () => {
  const journey = createOutfitCompatibilityJourney();
  journey.run();
  journey.selectMode('conflicting-fit');
  assert.equal(journey.getView().result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'compatible');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createOutfitCompatibilityJourney().selectMode('buy-this-look').error,
    'unsupported-outfit-compatibility-mode',
  );
});

test('journey output excludes private profile, wardrobe, and commerce data', () => {
  const serialized = JSON.stringify(createOutfitCompatibilityJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /profile|wardrobe|privateNote|browsing|purchase|return|price|retailer|affiliate|commission|popularity|account/i,
  );
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_outfit_compatibility'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html')
      && name !== 'outfit-compatibility-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('outfit-compatibility-fixture.dc.html'));
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
