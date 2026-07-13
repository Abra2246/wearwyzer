// Isolated fixture universe for the style guide importer tests
// (scripts/__tests__/style-guide-importer.test.mjs). A small,
// self-consistent product/guide graph and a handful of representative
// source documents invented only for tests — never the real
// js/products.js, js/guides.js, or a real "Style Guides" folder (which,
// as of this change, does not exist in this repository — see
// docs/STYLE_GUIDE_IMPORTER_V1.md).

export const FIXTURE_PRODUCT_IDS = new Set(['fx-hero-jacket', 'fx-tee', 'fx-jeans', 'fx-cap']);

// "fx-hero-jacket" is the derived hero (the productId common to every
// outfit) of this existing guide, published well outside the 60-day hero
// cooldown relative to NOW below, so it never conflicts with a distinct
// new hero product.
export const FIXTURE_EXISTING_GUIDES = [
  {
    id: 'fx-existing-guide',
    title: 'How to Style the Fixture Trail Jacket',
    slug: 'guide-fx-existing.dc.html',
    verdict: 'A rugged trail jacket that also works for city commutes.',
    description: 'Outfits for the trail jacket.',
    publishedDate: '2026-01-01',
    outfits: [
      {
        name: 'Commute',
        when: 'Weekday mornings',
        why: 'x',
        items: [
          { name: 'Jacket', productId: 'fx-hero-jacket' },
          { name: 'Tee', productId: 'fx-tee' },
        ],
      },
      {
        name: 'Trail',
        when: 'Weekend hikes',
        why: 'x',
        items: [
          { name: 'Jacket', productId: 'fx-hero-jacket' },
          { name: 'Jeans', productId: 'fx-jeans' },
        ],
      },
    ],
  },
];

export const NOW = '2026-07-13T00:00:00.000Z';

export const COMPLETE_STRUCTURED_SOURCE = {
  path: 'Style Guides/new-shell-guide.json',
  content: JSON.stringify({
    heroProductId: 'fx-new-hero',
    concept: 'A weatherproof shell for three-season commuting and weekend errands.',
    hook: 'One jacket, three ways to wear it this week.',
    audience: { gender: 'men' },
    sources: [{ url: 'https://example.com/product/fx-new-hero', verifiedAt: '2026-07-01T00:00:00.000Z' }],
    productReferences: ['fx-tee', 'fx-jeans'],
    outfits: [
      {
        name: 'Office Commute',
        when: 'Weekday mornings, mixed indoor/outdoor.',
        why: 'The shell layers cleanly over office-appropriate basics.',
        items: [
          { name: 'Weatherproof Shell', productId: 'fx-new-hero' },
          { name: 'Crew Tee', productId: 'fx-tee' },
        ],
      },
      {
        name: 'Weekend Errands',
        when: 'Saturday errands, unpredictable weather.',
        why: 'Casual pieces underneath keep the look relaxed.',
        items: [
          { name: 'Weatherproof Shell', productId: 'fx-new-hero' },
          { name: 'Straight Jeans', productId: 'fx-jeans' },
        ],
      },
      {
        name: 'Evening Walk',
        when: 'Cool evenings, low-key plans.',
        why: 'Minimal layering keeps it simple after dark.',
        items: [
          { name: 'Weatherproof Shell', productId: 'fx-new-hero' },
          { name: 'Cap', productId: 'fx-cap' },
        ],
      },
    ],
    slides: [
      { order: 1, label: 'Cover', copy: 'One jacket, three ways to wear it.', altText: 'Cover slide for the jacket guide.' },
      { order: 2, label: 'Office Commute', copy: 'Shell over a crew tee.', altText: 'Office commute outfit slide.' },
      { order: 3, label: 'Weekend Errands', copy: 'Shell with straight jeans.', altText: 'Weekend errands outfit slide.' },
      { order: 4, label: 'Evening Walk', copy: 'Shell with a cap.', altText: 'Evening walk outfit slide.' },
    ],
    website: {
      title: 'How to Style the Fixture Weatherproof Shell',
      description: 'Three outfits for one weatherproof shell jacket.',
      slugHint: 'fx-new-hero',
      tags: ['Jackets', 'Everyday'],
    },
    social: {
      caption: 'One jacket, three ways to wear it this week. #wearwyzer',
      altText: 'Carousel cover: weatherproof shell styled three ways.',
    },
    newProducts: [
      {
        id: 'fx-new-hero',
        name: 'Fixture New Hero Jacket',
        brand: 'FixtureCo',
        category: 'Jackets',
        image: 'assets/images/products/fx-new-hero.png',
        priceStatus: 'tbd',
        tags: ['Everyday'],
      },
    ],
  }),
};

// Same slug hint as an existing published guide — must be skipped, never re-imported.
export const DUPLICATE_STRUCTURED_SOURCE = {
  path: 'Style Guides/existing-jacket-guide.json',
  content: JSON.stringify({
    heroProductId: 'fx-hero-jacket',
    website: { title: 'How to Style the Fixture Trail Jacket', slugHint: 'fx-existing' },
  }),
};

// Real product reference, but missing every other required manifest fact.
export const MISSING_FACTS_STRUCTURED_SOURCE = {
  path: 'Style Guides/incomplete-guide.json',
  content: JSON.stringify({ heroProductId: 'fx-tee' }),
};

export const INVALID_JSON_SOURCE = {
  path: 'Style Guides/broken.json',
  content: '{ not valid json',
};

export const FREEFORM_TEXT_SOURCE = {
  path: 'Style Guides/notes.md',
  content: '# Some style notes\n\nWear the jacket with jeans on cooler days.',
};

export const UNSUPPORTED_BINARY_SOURCE = {
  path: 'Style Guides/lookbook.pdf',
  content: '',
};

export const UNKNOWN_FORMAT_SOURCE = {
  path: 'Style Guides/mystery.xyz',
  content: 'whatever',
};
