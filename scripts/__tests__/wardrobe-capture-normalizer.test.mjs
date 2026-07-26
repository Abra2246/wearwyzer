import test from 'node:test';
import assert from 'node:assert/strict';
import { products } from '../../data/products.js';
import { createOnboardingWardrobeStore } from '../onboarding-wardrobe-store.mjs';
import {
  correctCaptureCandidate,
  createCaptureCandidate,
  WARDROBE_CAPTURE_VERSION,
} from '../wardrobe-capture-normalizer.mjs';

const NOW = '2026-07-26T01:00:00.000Z';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('manual search creates a reviewable exact candidate without auto-adding it', () => {
  const result = createCaptureCandidate({
    source: 'manual-search',
    query: 'dickies-874-dark-navy',
    sequence: 2,
    nowIso: NOW,
    products,
  });
  assert.equal(result.ok, true);
  assert.equal(result.candidate.schemaVersion, WARDROBE_CAPTURE_VERSION);
  assert.equal(result.candidate.status, 'review-required');
  assert.equal(result.candidate.match.state, 'exact');
  assert.equal(result.candidate.match.productId, 'dickies-874-dark-navy');
  assert.equal(result.candidate.fields[0].provenance, 'manual-entry');
});

test('simulated camera output remains a suggestion with field-level provenance', () => {
  const result = createCaptureCandidate({
    source: 'simulated-camera',
    fixtureId: 'navy-work-pant',
    sequence: 2,
    nowIso: NOW,
    products,
  });
  assert.equal(result.candidate.match.state, 'suggested');
  assert.equal(result.candidate.match.productId, null);
  assert.ok(result.candidate.fields.every((entry) =>
    entry.provenance === 'simulated-camera-inference'
  ));
  assert.ok(result.candidate.fields.every((entry) => entry.confidence < 1));
  assert.deepEqual(result.candidate.rawReference, {
    kind: 'synthetic-fixture-id',
    value: 'navy-work-pant',
  });
});

test('ambiguous and unknown camera fixtures remain explicit', () => {
  const ambiguous = createCaptureCandidate({
    source: 'simulated-camera',
    fixtureId: 'barrel-pant',
    sequence: 2,
    nowIso: NOW,
    products,
  }).candidate;
  assert.equal(ambiguous.match.state, 'ambiguous');
  assert.equal(ambiguous.match.options.length, 2);
  assert.ok(ambiguous.match.options.every((option) => option.matchState === 'ambiguous'));

  const unknown = createCaptureCandidate({
    source: 'simulated-camera',
    fixtureId: 'unknown-jacket',
    sequence: 3,
    nowIso: NOW,
    products,
  }).candidate;
  assert.equal(unknown.match.state, 'unknown');
  assert.deepEqual(unknown.match.options, []);
});

test('explicit correction outranks inference and creates a versioned exact resolution', () => {
  const candidate = createCaptureCandidate({
    source: 'simulated-camera',
    fixtureId: 'barrel-pant',
    sequence: 2,
    nowIso: NOW,
    products,
  }).candidate;
  const corrected = correctCaptureCandidate(candidate, {
    productId: 'uniqlo-barrel-pants-cream',
    color: 'Cream',
    size: 'M',
  }, products, NOW);
  assert.equal(corrected.ok, true);
  assert.equal(corrected.candidate.match.state, 'exact');
  assert.equal(corrected.candidate.match.productId, 'uniqlo-barrel-pants-cream');
  assert.equal(corrected.candidate.match.resolution, 'explicit-user-correction');
  assert.equal(corrected.candidate.correctionVersion, 1);
  assert.match(corrected.correction.correctionId, /correction-v1$/);
  assert.ok(corrected.candidate.fields.every((entry) =>
    entry.provenance === 'explicit-user-correction' && entry.confidence === 1
  ));
});

test('store capture actions fail closed without personalization consent', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  assert.equal(
    store.beginCapture({ source: 'simulated-camera', fixtureId: 'navy-work-pant' }).error,
    'personalization-consent-required',
  );
});

test('camera suggestion requires correction before confirmation and advances the wardrobe snapshot', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  store.setConsent('personalization', 'granted');
  const started = store.beginCapture({
    source: 'simulated-camera',
    fixtureId: 'navy-work-pant',
  });
  assert.equal(store.confirmCapture(started.candidate.candidateId).error, 'explicit-exact-correction-required');
  const corrected = store.correctCapture(started.candidate.candidateId, {
    productId: 'dickies-874-dark-navy',
    color: 'Dark Navy',
    size: '32x30',
  });
  const confirmed = store.confirmCapture(started.candidate.candidateId);
  assert.equal(corrected.ok, true);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.wardrobeSnapshot.version, 2);
  assert.equal(confirmed.wardrobeSnapshot.items[0].provenance, 'confirmed-simulated-camera');
  assert.equal(confirmed.wardrobeSnapshot.items[0].captureId, started.candidate.candidateId);
  assert.equal(confirmed.wardrobeSnapshot.items[0].confirmedFields[4].value, '32x30');
});

test('manual exact candidate still requires an explicit confirm action', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  store.setConsent('personalization', 'granted');
  const started = store.beginCapture({
    source: 'manual-search',
    query: 'adidas-samba-og-b75806',
  });
  assert.equal(store.getSnapshot().wardrobeSnapshot.items.length, 0);
  assert.equal(store.confirmCapture(started.candidate.candidateId).ok, true);
  assert.equal(store.getSnapshot().wardrobeSnapshot.items[0].productId, 'adidas-samba-og-b75806');
});

test('rejection, export, deletion, and reset preserve the complete fixture lifecycle', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  store.setConsent('personalization', 'granted');
  const started = store.beginCapture({
    source: 'simulated-camera',
    fixtureId: 'unknown-jacket',
  });
  assert.equal(store.rejectCapture(started.candidate.candidateId).ok, true);
  const exported = JSON.parse(store.exportJson());
  assert.equal(exported.captureIntake.records[0].status, 'rejected');
  assert.equal(exported.captureIntake.records[0].rawReference.kind, 'synthetic-fixture-id');
  store.requestDeletion();
  store.completeDeletion();
  assert.deepEqual(store.getSnapshot().captureIntake.records, []);
  assert.deepEqual(store.reset().captureIntake.records, []);
});

test('confirmed capture cannot bypass duplicate prevention', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  store.setConsent('personalization', 'granted');
  assert.equal(store.addProduct('adidas-samba-og-b75806').ok, true);
  const started = store.beginCapture({
    source: 'manual-search',
    query: 'adidas-samba-og-b75806',
  });
  assert.equal(store.confirmCapture(started.candidate.candidateId).error, 'duplicate-wardrobe-item');
});
