import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  STYLE_DNA_MODES,
  createStyleDnaJourney,
} from '../style-dna-journey.mjs';

const route = readFileSync(
  new URL('../../style-dna-fixture.dc.html', import.meta.url),
  'utf8',
);

test('journey starts empty, fixture-only, local, and external-action disabled', () => {
  const view = createStyleDnaJourney().getView();
  assert.equal(view.result, null);
  assert.equal(view.fixtureOnly, true);
  assert.equal(view.commerceActionsAvailable, false);
  assert.equal(view.behaviorCollectionAvailable, false);
  assert.equal(view.networkActionsAvailable, false);
  assert.equal(view.persistenceAvailable, false);
  assert.deepEqual(view.supportedModes, [...STYLE_DNA_MODES]);
});

test('baseline keeps explicit and inferred signals visibly distinct', () => {
  const result = createStyleDnaJourney().run().view.result;
  assert.equal(result.signals.find(({ value }) => value === 'minimal').source, 'explicit-user');
  assert.equal(result.signals.find(({ value }) => value === 'relaxed').source, 'inferred');
});

test('explicit conflict keeps the user choice and requires review', () => {
  const journey = createStyleDnaJourney();
  journey.selectMode('explicit-conflict');
  const result = journey.run().view.result;
  assert.equal(result.status, 'review-required');
  assert.equal(result.signals[0].sentiment, 'negative');
  assert.equal(result.signals[0].source, 'explicit-user');
  assert.equal(result.conflicts[0].code, 'explicit-and-inferred-sentiment-conflict');
});

test('decayed, weak, and stale inference remain distinct', () => {
  const journey = createStyleDnaJourney();
  journey.selectMode('decayed-inference');
  const decayed = journey.run().view.result;
  assert.equal(decayed.signals[0].confidence, 0.77);
  assert.equal(decayed.inferenceSummary.acceptedCount, 1);
  journey.selectMode('stale-and-low-confidence');
  const ignored = journey.run().view.result;
  assert.deepEqual(ignored.signals, []);
  assert.equal(ignored.inferenceSummary.ignoredLowConfidenceCount, 1);
  assert.equal(ignored.inferenceSummary.ignoredStaleCount, 1);
});

test('explicit correction replaces inferred sentiment', () => {
  const journey = createStyleDnaJourney();
  journey.selectMode('corrected-signal');
  const result = journey.run().view.result;
  assert.equal(result.signals[0].sentiment, 'negative');
  assert.equal(result.signals[0].source, 'explicit-correction');
});

test('later correction removes earlier signal without stale memory', () => {
  const journey = createStyleDnaJourney();
  journey.selectMode('reversed-correction');
  assert.deepEqual(journey.run().view.result.signals, []);
});

test('exploration is temporary and separate from canonical signals', () => {
  const journey = createStyleDnaJourney();
  journey.selectMode('temporary-exploration');
  const result = journey.run().view.result;
  assert.equal(result.exploration.enabled, true);
  assert.equal(result.exploration.affectsCanonicalProfile, false);
  assert.equal(result.signals.some(({ value }) => value === 'avant-garde'), false);
  assert.equal(result.status, 'review-required');
});

test('changing mode and reset clear prior results', () => {
  const journey = createStyleDnaJourney();
  journey.run();
  journey.selectMode('explicit-conflict');
  assert.equal(journey.getView().result, null);
  journey.run();
  const reset = journey.reset();
  assert.equal(reset.view.mode, 'explicit-and-inferred');
  assert.equal(reset.view.result, null);
});

test('unsupported modes fail closed', () => {
  assert.equal(
    createStyleDnaJourney().selectMode('watch-my-browser').error,
    'unsupported-style-dna-mode',
  );
});

test('journey output excludes private behavior, identity, and commerce data', () => {
  const serialized = JSON.stringify(createStyleDnaJourney().run().view);
  assert.doesNotMatch(
    serialized,
    /wardrobe|browsing|purchase|return|privateNote|account|protectedAttribute|price|retailer|affiliate|commission|popularity/i,
  );
});

test('route is noindex, default-off, exact-flag gated, and unlinked', () => {
  assert.match(route, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(route, /get\('ww_style_dna'\) === '1'/);
  assert.match(route, /id="disabled"/);
  assert.match(route, /id="enabled" hidden/);
  const root = new URL('../../', import.meta.url);
  const references = readdirSync(root)
    .filter((name) => name.endsWith('.dc.html') && name !== 'style-dna-fixture.dc.html')
    .filter((name) => readFileSync(new URL(name, root), 'utf8')
      .includes('style-dna-fixture.dc.html'));
  assert.deepEqual(references, []);
});

test('route has no network, collection, commerce, or accessibility regressions', () => {
  assert.doesNotMatch(route, /fetch\(|XMLHttpRequest|WebSocket|OPENAI_API_KEY/);
  assert.doesNotMatch(route, /id="(?:buy|checkout|purchase|affiliate|account|camera|upload|track|save)"/);
  assert.match(route, /External actions:<\/strong> unavailable/);
  assert.match(route, /html,body \{ max-width:100%; overflow-x:hidden; \}/);
  assert.match(route, /@media \(max-width:680px\)/);
  assert.match(route, /:focus-visible/);
  assert.match(route, /min-height:44px/);
});
