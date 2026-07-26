import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOnboardingWardrobeStore,
  MINIMUM_WARDROBE_ITEMS,
  ONBOARDING_WARDROBE_VERSION,
} from '../onboarding-wardrobe-store.mjs';

const NOW = '2026-07-26T00:30:00.000Z';
const OWNED_IDS = [
  'dickies-874-dark-navy',
  'birkenstock-boston-taupe',
  'gap-overshirt-beige',
  'levis-568-jeans',
  'uniqlo-airism-tee-gray',
];

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function profileInput() {
  return {
    favoriteBrands: 'adidas, Dickies, Uniqlo',
    preferredColors: 'navy, cream, olive',
    preferredAesthetics: 'minimal, smart-casual, workwear',
    commonOccasions: 'everyday, office, date night',
    footwearBudget: 160,
    pantsBudget: 120,
    topsBudget: 90,
    topFit: 'relaxed',
    bottomFit: 'straight',
    footwearFit: 'true-to-size',
    footwearSize: 'US 10',
    topSize: 'M',
    pantsSize: '32x30',
  };
}

function grantRequired(store) {
  for (const purpose of ['personalization', 'style-learning', 'fit-guidance']) {
    assert.equal(store.setConsent(purpose, 'granted').ok, true);
  }
}

function completeStore(options = {}) {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW, ...options });
  grantRequired(store);
  assert.equal(store.saveProfile(profileInput()).ok, true);
  for (const id of OWNED_IDS) assert.equal(store.addProduct(id).ok, true);
  return store;
}

test('starts empty, fixture-only, and with every consent purpose independent', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.schemaVersion, ONBOARDING_WARDROBE_VERSION);
  assert.equal(snapshot.fixtureOnly, true);
  assert.equal(snapshot.profile, null);
  assert.equal(snapshot.wardrobeSnapshot.items.length, 0);
  assert.ok(snapshot.consents.length >= 5);
  assert.ok(snapshot.consents.every((consent) => consent.status === 'not-granted'));
});

test('profile save fails closed until style and fit consent are independently granted', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  assert.equal(store.saveProfile(profileInput()).error, 'style-learning-consent-required');
  store.setConsent('style-learning', 'granted');
  assert.equal(store.saveProfile(profileInput()).error, 'fit-guidance-consent-required');
  store.setConsent('fit-guidance', 'granted');
  assert.equal(store.saveProfile(profileInput()).ok, true);
});

test('saved profile and fit signals are explicit, confidence-one, and versioned', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  store.setConsent('style-learning', 'granted');
  store.setConsent('fit-guidance', 'granted');
  const first = store.saveProfile(profileInput());
  assert.equal(first.profile.version, 1);
  assert.ok(first.profile.signals.every((signal) =>
    signal.provenance === 'explicit' && signal.confidence === 1
  ));
  assert.ok(first.fitProfile.observations.every((observation) =>
    observation.provenance === 'explicit' && observation.confidence === 1
  ));
  const second = store.saveProfile({ ...profileInput(), topFit: 'regular' });
  assert.equal(second.profile.version, 2);
  assert.notEqual(first.profile.profileId, second.profile.profileId);
});

test('canonical search labels exact, similar, unknown, and ambiguous results honestly', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  assert.equal(store.searchProducts('Samba OG')[0].matchState, 'exact');
  assert.equal(store.searchProducts('Oversized Cream Tee')[0].matchState, 'similar');
  assert.deepEqual(store.searchProducts('not a real product'), []);
  const barrels = store.searchProducts('Barrel Pants');
  assert.equal(barrels.length, 2);
  assert.ok(barrels.every((result) => result.matchState === 'ambiguous'));
});

test('wardrobe add requires consent and rejects similar, ambiguous, unknown, and duplicate products', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  assert.equal(store.addProduct('adidas-samba-og-b75806').error, 'personalization-consent-required');
  store.setConsent('personalization', 'granted');
  assert.equal(store.addProduct('cream-tee').error, 'exact-product-required');
  assert.equal(store.addProduct('uniqlo-barrel-pants-brown').error, 'ambiguous-product-match');
  assert.equal(store.addProduct('missing').error, 'unknown-product-match');
  assert.equal(store.addProduct('adidas-samba-og-b75806').ok, true);
  assert.equal(store.addProduct('adidas-samba-og-b75806').error, 'duplicate-wardrobe-item');
});

test('wardrobe mutations create new snapshot references and removal is deterministic', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  store.setConsent('personalization', 'granted');
  const before = store.getSnapshot().wardrobeSnapshot.wardrobeSnapshotId;
  const added = store.addProduct('adidas-samba-og-b75806');
  assert.notEqual(added.wardrobeSnapshot.wardrobeSnapshotId, before);
  const removed = store.removeProduct('adidas-samba-og-b75806');
  assert.equal(removed.ok, true);
  assert.equal(removed.wardrobeSnapshot.items.length, 0);
});

test('purchase evaluation fails closed for missing consent, incomplete profile, and fewer than five items', () => {
  const store = createOnboardingWardrobeStore(memoryStorage(), { now: () => NOW });
  assert.equal(store.evaluateCandidate().error, 'personalization-consent-required');
  grantRequired(store);
  assert.equal(store.evaluateCandidate().error, 'incomplete-profile');
  store.saveProfile(profileInput());
  assert.equal(store.evaluateCandidate().error, 'insufficient-wardrobe');
  assert.equal(store.evaluateCandidate().minimum, MINIMUM_WARDROBE_ITEMS);
});

test('complete journey passes only versioned references into the existing personalization boundary', () => {
  let capturedRequest;
  const evaluate = (request, context, options) => {
    capturedRequest = structuredClone(request);
    return {
      status: 'ok',
      recommendation: 'buy',
      confidence: 'high',
      scores: { outfitUnlocks: 8, purchaseRoi: 91, compatibility: { score: 94 } },
      outfits: [],
      subjectRefs: { ...request.subject },
      freshness: { evaluatedAtIso: options.nowIso },
    };
  };
  const store = completeStore({ evaluate });
  const result = store.evaluateCandidate();
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(capturedRequest.subject).sort(), ['profileId', 'wardrobeSnapshotId']);
  assert.equal('profile' in capturedRequest, false);
  assert.equal('wardrobe' in capturedRequest, false);
  assert.match(capturedRequest.subject.profileId, /^fixture-onboarding-profile-v/);
  assert.match(capturedRequest.subject.wardrobeSnapshotId, /^fixture-onboarding-wardrobe-v/);
});

test('revoked consent blocks the very next evaluation', () => {
  const store = completeStore({
    evaluate: () => ({ status: 'ok', recommendation: 'buy', scores: {}, outfits: [] }),
  });
  assert.equal(store.evaluateCandidate().ok, true);
  store.setConsent('personalization', 'revoked');
  assert.equal(store.evaluateCandidate().error, 'personalization-consent-required');
});

test('snapshot freshness is explicit and stale snapshots fail closed', () => {
  const storage = memoryStorage();
  let clock = NOW;
  const store = createOnboardingWardrobeStore(storage, { now: () => clock });
  grantRequired(store);
  store.saveProfile(profileInput());
  for (const id of OWNED_IDS) store.addProduct(id);
  clock = '2026-09-01T00:30:00.000Z';
  assert.equal(store.getSnapshot().wardrobeSnapshot.stale, true);
  assert.equal(store.evaluateCandidate().error, 'stale-wardrobe-snapshot');
});

test('export is versioned and complete for the local fixture journey', () => {
  const store = completeStore();
  const exported = JSON.parse(store.exportJson());
  assert.equal(exported.schemaVersion, 'private-profile-export-v1');
  assert.equal(exported.fixtureOnly, true);
  assert.equal(exported.wardrobeSnapshot.items.length, 5);
  assert.equal(exported.profile.signals[0].provenance, 'explicit');
  assert.doesNotThrow(() => JSON.stringify(exported));
});

test('deletion exposes pending and completed states and removes private fixture records', () => {
  const store = completeStore();
  assert.equal(store.requestDeletion().deletion.state, 'pending');
  assert.equal(store.getSnapshot().account.status, 'deleting');
  assert.equal(store.completeDeletion().deletion.state, 'completed');
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.account.status, 'deleted');
  assert.equal(snapshot.profile, null);
  assert.equal(snapshot.fitProfile, null);
  assert.equal(snapshot.wardrobeSnapshot.items.length, 0);
  assert.ok(snapshot.consents.every((consent) => consent.status === 'not-granted'));
});

test('reset and corrupted storage both restore deterministic empty fixture state', () => {
  const storage = memoryStorage();
  const store = createOnboardingWardrobeStore(storage, { now: () => NOW });
  grantRequired(store);
  store.saveProfile(profileInput());
  assert.equal(store.reset().profile, null);
  storage.setItem('wearwyzer.onboarding-wardrobe.v1', 'not-json');
  assert.equal(store.getSnapshot().profile, null);
});
