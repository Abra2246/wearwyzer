export const FIXTURE_PROFILE = Object.freeze({
  id: 'fixture-user-menswear-01',
  audience: 'menswear',
  commonOccasions: Object.freeze(['Everyday', 'Business casual', 'Date night']),
  favoriteBrands: Object.freeze(['adidas', 'Dickies']),
  avoidedBrands: Object.freeze([]),
  preferredColors: Object.freeze(['navy', 'cream', 'white', 'black', 'beige']),
  preferredAesthetics: Object.freeze(['minimal', 'smart-casual', 'workwear']),
  categoryBudgets: Object.freeze({ footwear: 140, pants: 100, tops: 80 }),
  fitPreferences: Object.freeze({
    top: 'relaxed',
    bottom: 'straight',
    footwear: 'true-to-size',
  }),
});

export const FIXTURE_WARDROBE = Object.freeze([
  Object.freeze({ id: 'owned-cream-tee', productId: 'cream-tee', wearCount: 18 }),
  Object.freeze({ id: 'owned-oxford-shirt', productId: 'oxford-shirt', wearCount: 11 }),
  Object.freeze({ id: 'owned-dickies', productId: 'dickies-874-dark-navy', wearCount: 15 }),
  Object.freeze({ id: 'owned-black-trousers', productId: 'black-trousers', wearCount: 9 }),
  Object.freeze({ id: 'owned-gap-overshirt', productId: 'gap-overshirt-beige', wearCount: 8 }),
  Object.freeze({ id: 'owned-minimal-watch', productId: 'minimal-watch', wearCount: 20 }),
]);

export const FIXTURE_CANDIDATE_ID = 'adidas-samba-og-b75806';

export const FIXTURE_PROTOTYPE_DATA = Object.freeze({
  fixtureOnly: true,
  consent: Object.freeze({
    storage: 'local-device-only',
    analytics: false,
    training: false,
  }),
  profile: FIXTURE_PROFILE,
  wardrobe: FIXTURE_WARDROBE,
  candidateId: FIXTURE_CANDIDATE_ID,
});
