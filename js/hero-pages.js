// ============================================================
// WEARWYZER — dedicated hero-product page registry.
//
// Maps a product id (data/products.js) to its dedicated hero page, if one
// exists. This is hand-authored routing config, not derived content — it
// belongs alongside js/site-data.js, not under data/ (see
// docs/KNOWLEDGE_GRAPH_V1.md "Source-of-truth boundaries": everything
// under data/ is a computed projection of js/products.js/js/guides.js,
// never hand-authored).
//
// To add a new hero page: duplicate product-nb-9060-breakfast-tea.dc.html,
// change its PRODUCT_ID constant and <helmet> text, then add an entry here
// so nav links on products.dc.html / shop.dc.html / the product's guide
// page pick it up automatically. scripts/validate-hero-product-pages.mjs
// checks every entry's productId resolves and its file exists on disk.
// ============================================================
export const HERO_PRODUCT_PAGES = {
  'nb-9060-breakfast-tea': 'product-nb-9060-breakfast-tea.dc.html',
};

export function getHeroProductPageHref(productId) {
  return HERO_PRODUCT_PAGES[productId] || null;
}

export default { HERO_PRODUCT_PAGES, getHeroProductPageHref };
