import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { createStylistJourneyState } from '../ai-stylist-journey.mjs';
import { STYLIST_INTENTS } from '../ai-stylist-contract.mjs';

const route = readFileSync(new URL('../../ai-stylist-fixture.dc.html', import.meta.url), 'utf8');

test('journey starts empty, provider-free, and external-action disabled', () => {
  const view = createStylistJourneyState().getView();
  assert.equal(view.result, null);
  assert.equal(view.providerMode, 'fixture-only-no-network');
  assert.equal(view.externalActionsAvailable, false);
  assert.deepEqual(view.supportedIntents, [...STYLIST_INTENTS]);
});

test('every supported intent produces a grounded minimized answer', () => {
  const journey = createStylistJourneyState();
  for (const intent of STYLIST_INTENTS) {
    assert.equal(journey.selectIntent(intent).ok, true);
    const result = journey.run();
    assert.equal(result.ok, true);
    assert.equal(result.view.result.outcome, 'answer');
    assert.ok(result.view.result.claims.length > 0);
    assert.ok(Object.keys(result.view.result.citationCatalog).length > 0);
  }
});

test('stale and insufficient evidence produce honest abstention', () => {
  const journey = createStylistJourneyState();
  for (const mode of ['stale', 'insufficient']) {
    journey.selectEvidenceMode(mode);
    const result = journey.run();
    assert.equal(result.ok, true);
    assert.equal(result.view.result.outcome, 'abstain');
    assert.deepEqual(result.view.result.claims, []);
    assert.equal(result.view.result.externalActionTaken, false);
  }
});

test('intent and evidence changes clear the prior answer', () => {
  const journey = createStylistJourneyState();
  journey.run();
  assert.notEqual(journey.getView().result, null);
  journey.selectIntent('plan-occasion');
  assert.equal(journey.getView().result, null);
  journey.run();
  journey.selectEvidenceMode('stale');
  assert.equal(journey.getView().result, null);
});

test('reset returns to deterministic defaults without prior response state', () => {
  const journey = createStylistJourneyState();
  journey.selectIntent('compare-options');
  journey.selectEvidenceMode('stale');
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.intent, STYLIST_INTENTS[0]);
  assert.equal(reset.view.evidenceMode, 'current');
  assert.equal(reset.view.result, null);
});

test('unsupported intent and evidence modes fail closed', () => {
  const journey = createStylistJourneyState();
  assert.equal(journey.selectIntent('purchase-for-me').error, 'unsupported-stylist-intent');
  assert.equal(journey.selectEvidenceMode('live-account').error, 'unsupported-evidence-mode');
});

test('journey output does not expose private prompts or raw wardrobe facts', () => {
  const journey = createStylistJourneyState();
  const serialized = JSON.stringify(journey.run().view);
  for (const forbidden of ['private prompt', 'confirmedOwnedItemIds', 'styleTags', '"facts"']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('route is noindex, default-off, and gated by the exact fixture flag', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_stylist'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
});

test('route has no external-action controls and imports no network/provider adapter', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|purchase|message|post|book|publish|account)"/);
  assert.match(route, /External actions:<\/strong> unavailable/);
});

test('route keeps mobile overflow and keyboard-focus safeguards', () => {
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:620px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
});

test('no public site page links to the fixture route', () => {
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html') && name !== 'ai-stylist-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8').includes('ai-stylist-fixture.dc.html'));
  assert.deepEqual(references, []);
});
