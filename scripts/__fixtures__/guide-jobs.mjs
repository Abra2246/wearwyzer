// Deterministic fixtures for the guide factory pipeline tests
// (scripts/__tests__/guide-*.test.mjs). This is an isolated fixture
// universe — a small, self-consistent product/guide graph invented only
// for tests — never the real js/products.js or js/guides.js. Keeping it
// separate means the tests never drift when real site content changes,
// and running the pipeline against these fixtures never touches or
// fabricates anything on the live site.

export const FIXTURE_PRODUCT_IDS = new Set([
  'fx-hero-jacket',
  'fx-hero-jacket-b',
  'fx-tee',
  'fx-jeans',
  'fx-boots',
  'fx-cap',
]);

// "fx-hero-jacket" is the derived hero (the productId common to every
// outfit) of this existing guide, published 23 days before NOW below —
// inside the default 60-day cooldown window.
export const FIXTURE_EXISTING_GUIDES = [
  {
    id: 'fx-existing-guide',
    verdict: 'A rugged trail jacket that also works for city commutes.',
    description: 'Outfits for the trail jacket.',
    publishedDate: '2026-06-20',
    outfits: [
      { name: 'Commute', when: 'Weekday mornings', why: 'x', items: [{ name: 'Jacket', productId: 'fx-hero-jacket' }, { name: 'Tee', productId: 'fx-tee' }] },
      { name: 'Trail', when: 'Weekend hikes', why: 'x', items: [{ name: 'Jacket', productId: 'fx-hero-jacket' }, { name: 'Boots', productId: 'fx-boots' }] },
    ],
  },
];

export const NOW = '2026-07-13T00:00:00.000Z';
const RECENT_ISO = '2026-07-01T00:00:00.000Z';
const STALE_ISO = '2025-01-01T00:00:00.000Z';

function baseManifest(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    jobId: 'fx-new-guide',
    status: 'approved',
    riskTier: 'medium',
    confidence: 'verified',
    heroProductId: 'fx-hero-jacket-b', // deliberately distinct from the existing fixture guide's hero
    concept: 'A weatherproof shell for three-season commuting and weekend errands.',
    hook: 'One jacket, five ways to wear it from Monday to Saturday.',
    audience: { gender: 'men' },
    sources: [{ url: 'https://example.com/product/fx-hero-jacket-b', verifiedAt: RECENT_ISO }],
    productReferences: ['fx-tee', 'fx-jeans', 'fx-cap'],
    newProducts: [],
    outfits: [
      {
        name: 'Office Commute',
        when: 'Weekday mornings, mixed indoor/outdoor.',
        why: 'The shell layers cleanly over office-appropriate basics.',
        items: [
          { name: 'Weatherproof Shell', productId: 'fx-hero-jacket-b' },
          { name: 'Crew Tee', productId: 'fx-tee' },
          { name: 'Straight Jeans', productId: 'fx-jeans' },
        ],
      },
      {
        name: 'Weekend Errands',
        when: 'Saturday errands, unpredictable weather.',
        why: 'Casual pieces underneath keep the look relaxed.',
        items: [
          { name: 'Weatherproof Shell', productId: 'fx-hero-jacket-b' },
          { name: 'Cap', productId: 'fx-cap' },
          { name: 'Straight Jeans', productId: 'fx-jeans' },
        ],
      },
      {
        name: 'Evening Walk',
        when: 'Cool evenings, low-key plans.',
        why: 'Minimal layering keeps it simple after dark.',
        items: [
          { name: 'Weatherproof Shell', productId: 'fx-hero-jacket-b' },
          { name: 'Crew Tee', productId: 'fx-tee' },
          { name: 'Cap', productId: 'fx-cap' },
        ],
      },
    ],
    slides: [
      { order: 1, label: 'Cover', copy: 'One jacket, five ways to wear it.', altText: 'Cover slide for the jacket guide.' },
      { order: 2, label: 'Office Commute', copy: 'Shell over a crew tee and straight jeans.', altText: 'Office commute outfit slide.' },
      { order: 3, label: 'Weekend Errands', copy: 'Shell, cap, and straight jeans.', altText: 'Weekend errands outfit slide.' },
      { order: 4, label: 'Evening Walk', copy: 'Shell over a crew tee with a cap.', altText: 'Evening walk outfit slide.' },
    ],
    website: {
      title: 'How to Style the Weatherproof Trail Shell',
      description: 'Three outfits for one weatherproof shell jacket — commute, errands, and evening.',
      slugHint: 'fx-hero-jacket-b',
      tags: ['Jackets', 'Everyday', 'Travel'],
      breadcrumbLabel: 'Weatherproof Trail Shell',
    },
    social: {
      caption: 'One jacket, three ways to wear it this week. #wearwyzer',
      altText: 'Carousel cover: weatherproof trail shell styled three ways.',
    },
    assets: { rendererMode: 'deterministic-template' },
    publication: { status: 'draft', publishedDate: null },
    createdAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

export const COMPLETE_APPROVED_MANIFEST = baseManifest();

export const MISSING_PRODUCT_FACT_MANIFEST = baseManifest({
  jobId: 'fx-missing-product-guide',
  productReferences: ['fx-tee', 'fx-nonexistent-item'],
});

export const DUPLICATE_HERO_MANIFEST = baseManifest({
  jobId: 'fx-duplicate-hero-guide',
  heroProductId: 'fx-hero-jacket',
  sources: [{ url: 'https://example.com/product/fx-hero-jacket', verifiedAt: RECENT_ISO }],
  outfits: baseManifest().outfits.map((o) => ({
    ...o,
    items: o.items.map((it) => (it.productId === 'fx-hero-jacket-b' ? { ...it, productId: 'fx-hero-jacket' } : it)),
  })),
});

export const STALE_SOURCE_MANIFEST = baseManifest({
  jobId: 'fx-stale-source-guide',
  sources: [{ url: 'https://example.com/product/fx-hero-jacket-b', verifiedAt: STALE_ISO }],
});

export const MISSING_ASSET_MANIFEST = baseManifest({
  jobId: 'fx-missing-asset-guide',
  assets: { rendererMode: 'external-provider' },
});

// Passes manifest-shape/dedup/source validation but fails the content
// quality policy's minimum-outfit-count check — simulates the "failed
// validator" end-to-end scenario.
export const TOO_FEW_OUTFITS_MANIFEST = baseManifest({
  jobId: 'fx-too-few-outfits-guide',
  outfits: baseManifest().outfits.slice(0, 2),
});

export const FABRICATED_PRICE_MANIFEST = baseManifest({
  jobId: 'fx-fabricated-price-guide',
  heroProductId: 'fx-new-hero',
  sources: [{ url: 'https://example.com/product/fx-new-hero', verifiedAt: RECENT_ISO }],
  newProducts: [
    {
      id: 'fx-new-hero',
      name: 'Fixture New Hero Jacket',
      brand: 'FixtureCo',
      category: 'Jackets',
      image: 'assets/images/products/fx-new-hero.png',
      price: 129,
      priceStatus: 'tbd', // fabrication: price set without a confirmed status
      tags: ['Everyday'],
    },
  ],
});

// Issue #18 pilot fixture: 5 slides matching the approved pilot defaults
// (slide 1 cover + slide 5 shop-the-looks summary stay deterministic-
// template; slides 2-4 are editorial outfit imagery for the OpenAI hybrid
// renderer). Same fixture universe as every manifest above — never
// touches real site content.
export const OPENAI_PILOT_HERO_PRODUCT = Object.freeze({
  id: 'fx-hero-jacket-b',
  name: 'Fixture Weatherproof Trail Shell',
  colorway: 'moss green',
  involvesHero: true,
});

export const OPENAI_PILOT_MANIFEST = baseManifest({
  jobId: 'fx-openai-pilot-guide',
  slides: [
    { order: 1, label: 'Cover', copy: 'One jacket, five ways to wear it.', altText: 'Cover slide for the jacket guide.' },
    { order: 2, label: 'Office Commute', copy: 'Shell over a crew tee and straight jeans.', altText: 'Office commute outfit slide.' },
    { order: 3, label: 'Weekend Errands', copy: 'Shell, cap, and straight jeans.', altText: 'Weekend errands outfit slide.' },
    { order: 4, label: 'Evening Walk', copy: 'Shell over a crew tee with a cap.', altText: 'Evening walk outfit slide.' },
    { order: 5, label: 'Shop The Looks', copy: 'Every piece from this guide, ready to shop.', altText: 'Summary slide listing every shoppable product from the guide.' },
  ],
  assets: { rendererMode: 'openai-hybrid' },
});
