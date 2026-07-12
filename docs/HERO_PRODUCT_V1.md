# WearWyzer — Hero Product v1 (issue #14)

Companion to `docs/KNOWLEDGE_GRAPH_V1.md`. Documents which product was selected as the first customer-facing Hero Product page, why, and exactly which graph relationships the page renders — so the acceptance criterion "the selected product and all displayed relationships are documented and verified" has a concrete answer instead of relying on reading the page's own controller code.

## Selection

**Selected: `nb-9060-breakfast-tea`** — New Balance 9060 "Breakfast Tea with Angora", the hero product of the existing, published `guide-nb9060.dc.html` (`nb9060-zara-polo` in `js/guides.js`/`data/guides.js`). No new product was introduced — this is one of the three products already serving as a guide hero on the live site today, per the issue's "prefer an existing current-site hero over introducing a new product" instruction.

### Candidates considered

The three published guides each have one hero product with a full `profile` block in `js/products.js`: `on-cloud-x4`, `nb-9060-breakfast-tea`, `nb-530-turtledove`. All three resolve cleanly through `data/*.js` and pass `scripts/validate-knowledge-graph.mjs`. Completeness was compared directly against the graph, not eyeballed:

| Product | Confirmed price | Retailer resolved | Subject-side relationships | Eligible for public recommendation |
|---|---|---|---|---|
| `on-cloud-x4` | No (`price: null`, `priceStatus: "tbd"`) | No (`retailer: ""`) | 4 (`MADE_BY`, `HAS_OFFER`, `FEATURED_IN`, `ALTERNATIVE_TO`) | 3 of 4 — carries the graph's one `draft`/`unverified` edge (`ALTERNATIVE_TO` → `light-jeans`) |
| **`nb-9060-breakfast-tea`** | **Yes — $159.99, `priceStatus: "confirmed"`, `lastChecked: "2026-07-09"`** | **Yes — New Balance** | 3 (`MADE_BY`, `HAS_OFFER`, `FEATURED_IN`) | **3 of 3 — every relationship is `verified`** |
| `nb-530-turtledove` | No (`price: null`, `priceStatus: "tbd"`) | Yes — New Balance | 3 (`MADE_BY`, `HAS_OFFER`, `FEATURED_IN`) | 3 of 3 |

`nb-9060-breakfast-tea` is the only candidate with both a confirmed commerce fact (price) *and* a fully `verified` relationship graph, so it's the most complete of the three by the graph's own metadata — not a subjective pick. (Its `affiliateUrl` is still unset, same as every product in the current data — see `js/products.js`'s own `// TODO: paste affiliate link` comments across all 33 products; the page renders this honestly as "Link coming soon" rather than fabricating a link.)

Re-run this comparison at any time with:
```
node -e "
import('./data/products.js').then(async (pmod) => {
  const { getOfferByProductId } = await import('./data/offers.js');
  const { getRelationshipsBySubject } = await import('./data/relationships.js');
  const { isPubliclyRecommendable } = await import('./data/taxonomies.js');
  for (const id of ['on-cloud-x4', 'nb-9060-breakfast-tea', 'nb-530-turtledove']) {
    const offer = getOfferByProductId(id);
    const edges = getRelationshipsBySubject('product', id);
    console.log(id, offer.priceStatus, offer.price, '-', edges.filter(isPubliclyRecommendable).length + '/' + edges.length, 'eligible');
  }
});
"
```

## What the page renders, and from which relationship

`product-nb-9060-breakfast-tea.dc.html` reads exclusively from `data/*.js` (never `js/products.js`/`js/guides.js` directly — see `docs/KNOWLEDGE_GRAPH_MIGRATION.md` Phase 3 for why that boundary is load-bearing). Every section maps to a specific, named relationship:

| Section | Source | Predicate | Eligibility gate applied? |
|---|---|---|---|
| Identity / image / brand / colorway / match type | `data/products.js` product record | — (entity fields, not a relationship) | N/A |
| Price / retailer | `data/offers.js` offer + `data/retailers.js` retailer | `OFFERED_BY` (offer → retailer) | N/A — commerce facts render as-is or "TBD"/"Link coming soon", never fabricated |
| Styling profile (why people ask, best for, works with, avoid, difficulty) | `data/products.js` `product.profile` | — (entity field) | N/A |
| "Featured In" guide card | `data/guides.js` guide | `FEATURED_IN` (product → guide) | Yes — only guides that are not `comingSoon` and have a real `slug` are ever linked |
| Outfits section | `data/outfits.js` outfit records | `INCLUDES_PRODUCT` (outfit → product) | Implicitly — only outfits belonging to a real, resolved guide exist in `data/outfits.js` at all |
| "Complete the Look" related products | `data/products.js` products reached via each featured guide's `relatedProductIds` | `RELATED_TO` (guide → product) | Implicitly — same as above |
| "You Might Also Like" | `data/products.js` products reached via `ALTERNATIVE_TO` edges | `ALTERNATIVE_TO` (product → product) | **Yes, explicitly** — filtered through `isPubliclyRecommendable()` |

`nb-9060-breakfast-tea` has zero `ALTERNATIVE_TO` edges in the current graph (see the table above), so "You Might Also Like" renders nothing and the section is omitted entirely (`sc-if`-gated) rather than shown empty or filled with a guess — verified in the Playwright screenshot referenced in the PR. The eligibility gate itself is exercised against real data by `scripts/validate-hero-product-pages.mjs`, which regression-tests that the graph's one known `draft`/`unverified` edge (`on-cloud-x4` → `light-jeans`) stays excluded from `isPubliclyRecommendable()` — this is the "temporary negative test for recommendation eligibility" the issue requires, implemented as a permanent, re-runnable check instead of a one-off manual step.

## Navigation added

- `products.dc.html` — "Full Profile →" link on the `nb-9060-breakfast-tea` card (only rendered when `js/hero-pages.js` has a registered page for that product id).
- `shop.dc.html` — "Full product profile →" link, same gating.
- `guide-nb9060.dc.html` — "Full Shoe Profile" button in the guide's hero section, alongside the existing "Shop the Shoe"/"Shop the Outfits" buttons.
- The hero page links back to `products.dc.html`, `guides.dc.html`, and its source guide (`guide-nb9060.dc.html`).

No existing guide page's data source changed, no `productId`/`relatedProducts`/`featuredInGuides` reference in `js/products.js`/`js/guides.js` was touched, and no legacy page was replaced — see `ARCHITECTURE.md` "Decision — Hero Product page" for the scope boundary this stayed inside.
