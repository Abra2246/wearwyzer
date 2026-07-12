# WearWyzer — Knowledge Graph v1 (Repository Specification)

**Status:** Additive foundation, implemented in issue #12. Nothing described here is wired into any live page yet — see "Source-of-truth boundaries" below.

**Provenance note (read this first):** the issue that requested this document names a canonical Notion specification (`https://app.notion.com/p/39ba52a2f7bd818f83e5c7c7386b7066`) as the source of truth for the entity model, relationship model, and confidence/verification rules. The environment this document was written in has no network/Notion access. Everything below was derived instead from the repository's own sources — `CLAUDE.md`, `ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/FEATURE_INVENTORY.md`, `js/products.js`, `js/guides.js`, `js/site-data.js`, and `scripts/validate-content-data.mjs` — plus the concrete shape of the data already living in those files. **A human reviewer with Notion access must diff this document against the canonical spec before treating it as final**; where they disagree, Notion wins and this file (plus the code under `data/`) should be updated to match. Every design decision below is justified from a concrete, cited repository fact specifically so that reconciliation is tractable.

## Why a graph, and why now

`ARCHITECTURE.md` names the same underlying problem four separate times without ever proposing a unified fix:
- Recommendation 2: "no validation that `productId` references resolve... a typo silently breaks a Shop link."
- Recommendation 4: `affiliateUrl` is "a single hardcoded string per product... can't represent multiple retailers per product."
- Recommendation 5: outfits are "hand-authored outfit combinations, not a queryable outfit graph," which blocks the AI Stylist / Outfit Builder milestones entirely.
- `docs/FEATURE_INVENTORY.md` documents three concrete, shipped bugs (wrong `productId` on three outfit items, two pages hardcoding every "view the guide" link to guide #1) that are all instances of the same root cause: **relationships between content entities are currently expressed only as ad hoc string fields with no shared model, no confidence, and no validation beyond "does this ID exist somewhere."**

This graph gives every one of those relationships (`product` made by `brand`, `product` featured in `guide`, `outfit` includes `product`, `product` is an alternative to `product`, etc.) a single, uniform shape — subject, predicate, object, confidence, verification status — so they can all be validated the same way, and so a future recommendation feature has one place to ask "is this fact trustworthy enough to show a user," instead of re-deriving that judgment per feature.

## Source-of-truth boundaries

For this version:
- **`js/products.js` and `js/guides.js` remain canonical.** Every module under `data/` is a derived, read-only projection, computed from them at import time (see each module's own header for exactly which legacy fields it reads). None of the `data/` modules are hand-authored content — they cannot drift from the legacy files because they are literally computed from them.
- **No `.dc.html` page imports from `data/` in this change.** `js/products.js`/`js/guides.js` keep driving the live site exactly as before. `data/adapters.js` exists to prove the new modules can reproduce the legacy contract, not to replace it yet — see `docs/KNOWLEDGE_GRAPH_MIGRATION.md` Phase 3 for when/how that flip happens.
- **This ordering will eventually invert.** Once a real editorial workflow exists to author graph records directly (Milestone 3/6 in `ROADMAP.md`), `data/` becomes canonical and `js/products.js`/`js/guides.js` become the derived/generated artifacts (or are retired). That inversion is out of scope for this issue.

## Entity model

| Entity | Module | Identity | What it represents |
|---|---|---|---|
| Brand | `data/brands.js` | `id` (slug of name) | A manufacturer/label named on a product (e.g. "New Balance"). Derived from every distinct non-empty `product.brand` string. |
| Retailer | `data/retailers.js` | `id` (slug of name) | Where a product's offer is/would be sold. Derived from every distinct non-empty `product.retailer` string. Modeled as a distinct entity from Brand from day one — even though every current retailer string equals its product's brand (the brand sells direct) — because `ARCHITECTURE.md` Recommendation 4 explicitly calls out multi-retailer support as the reason `affiliateUrl` needs to stop being a single product field. |
| Offer | `data/offers.js` | `id` (== `productId`, 1:1 in v1) | The commerce facts for one product: price, price status, retailer, affiliate URL, match type, last-checked date. Split out from Product specifically so a future N-offers-per-product model (Phase 2 of the migration doc) doesn't require touching the Product entity at all. |
| Product | `data/products.js` | `id` (preserved verbatim from `js/products.js`) | A styleable item: name, category, colorway, image, occasion tags, styling profile. Commerce facts live on its Offer; brand/retailer/guide/outfit associations live in Relationships. |
| Outfit | `data/outfits.js` | `id` (`${guideId}--${slug(name)}`) | One named look within a Guide (e.g. "Business Casual"): a `when` context, a `why` rationale, and an ordered list of items. Each item resolves to a Product or carries an explicit editorial label (see "Outfit item resolution" below) — it never silently drops or guesses at an unresolved reference. |
| Guide | `data/guides.js` | `id` (preserved verbatim) | One editorial piece (today: one Instagram-carousel-style guide) built around a hero Product, containing an ordered set of Outfits. |
| Collection | `data/collections.js` | `id` | A curated, named group of Products and/or Guides that is *not* guide-scoped (e.g. a future "Summer capsule"). **No collection exists in the current site — this entity type ships with zero records in v1**, per the issue's "do not invent missing data" rule; see that module's header. |

Every entity record also carries a `reviewStatus` field (vocabulary in `data/taxonomies.js REVIEW_STATUSES`) classifying how it was obtained — `direct_mapping`, `derived`, `legacy_compat`, `missing_canonical_data`, or `ambiguous_review_required` — so a downstream consumer can tell a hand-authored fact from a computed one without reading this document. See `docs/CURRENT_DATA_TO_GRAPH_MAPPING.md` for the field-by-field classification that produced these.

## Relationship model

Every relationship (`data/relationships.js`) is a single flat record:

```
{
  id: string,                 // `${predicate}:${subjectType}:${subjectId}:${objectType}:${objectId}` — deterministic, doubles as the dedupe key
  predicate: string,          // one of RELATIONSHIP_PREDICATES
  subjectType: string,        // one of ENTITY_TYPES
  subjectId: string,
  objectType: string,
  objectId: string,
  confidence: string,         // one of CONFIDENCE_LEVELS
  verificationStatus: string, // one of VERIFICATION_STATUSES
  notes: string|null,
}
```

### Approved predicates (`RELATIONSHIP_PREDICATES`)

| Predicate | Subject → Object | Derived from |
|---|---|---|
| `MADE_BY` | product → brand | `product.brand` |
| `HAS_OFFER` | product → offer | 1:1 construction (every product has exactly one offer in v1) |
| `OFFERED_BY` | offer → retailer | `product.retailer` |
| `FEATURED_IN` | product → guide | `product.featuredInGuides` |
| `RELATED_TO` | guide → product | `guide.relatedProducts` |
| `CONTAINS_OUTFIT` | guide → outfit | `guide.outfits` (existence) |
| `INCLUDES_PRODUCT` | outfit → product | `outfit.items[].productId` (only where it resolves — see below) |
| `ALTERNATIVE_TO` | product → product | `product.profile.alternatives` |
| `REPLACES` | any → same type | Not present in any current data. Modeled now so `scripts/validate-knowledge-graph.mjs`'s cycle check and the migration doc's versioning story have a predicate to point at; see `docs/KNOWLEDGE_GRAPH_MIGRATION.md`. |

Every relationship in v1 is derived programmatically from a field that already exists in `js/products.js`/`js/guides.js` — none are hand-authored. See `data/relationships.js`'s header for the full derivation.

### Outfit item resolution

`outfit.items[]` entries have exactly one of `productId` (resolves to a real Product) or `editorialLabel` (the item's original text, kept when no Product exists for it), never both, never neither. In the current data every item resolves to a real product, so `editorialLabel` is unexercised by real data today — the validator's own self-test is what exercises that path (see "Validation" below). This directly implements the issue's requirement that "outfit product references resolve or use an explicit editorial label" instead of silently dropping unresolved references or fabricating a product to fill the slot.

## Confidence & verification rules

**Confidence** (`CONFIDENCE_LEVELS`, low → high): `unverified` < `inferred` < `editorial` < `verified`.
- `editorial`: authored directly by a human editor and currently live/rendered on the site (e.g. `featuredInGuides`, `relatedProducts`, an outfit's own item list). This is the default for every relationship derived from a field the live site already trusts and renders today.
- `verified`: has gone through an explicit confirmation step beyond original authorship — mirrors the distinction `js/products.js` already draws between `priceStatus: "tbd"` and `priceStatus: "confirmed"`. No relationship reaches this bar automatically in v1 by virtue of being copied from a legacy field; it's reserved for future editorial/QA workflow output.
- `inferred`: computed by a heuristic or model, not authored by a human (none exist in v1's data — reserved for future recommendation-engine output).
- `unverified`: exists in source data but the source itself flags it as incomplete or unconfirmed. **One concrete instance in v1:** `product.profile.alternatives` (used only by `on-cloud-x4`, pointing at `light-jeans`) is downgraded to `unverified`/`draft` because `js/products.js`'s own comment on that field reads `// TODO: add real alternative shoe IDs as they're covered` — the source data explicitly marks itself incomplete. This is not an invented downgrade; it's that comment made machine-checkable. See `data/relationships.js`.

**Verification status** (`VERIFICATION_STATUSES`): `draft`, `verified`, `stale`, `rejected`.
- Every relationship derived from a currently-live, currently-rendered legacy field starts `verified` — it is already published, not a proposal.
- `draft`: not yet confirmed for publication (the `ALTERNATIVE_TO` case above).
- `stale`: was verified but the underlying fact may have changed (no v1 data reaches this state; reserved for future re-verification workflows, e.g. price/link checks going out of date).
- `rejected`: reviewed and explicitly determined false/unwanted (no v1 data reaches this state).

**Public recommendation eligibility** (`isPubliclyRecommendable()` in `data/taxonomies.js`): a relationship is eligible for any future public-facing recommendation surface (search, "related products," "you might also like" — none of which exist yet per `ROADMAP.md`) only if `verificationStatus === 'verified'` **and** `confidence` is `editorial` or `verified`. This directly implements the issue's "public recommendation eligibility excludes draft, stale, rejected, or low-confidence relationships" requirement, and is exercised today by the one `ALTERNATIVE_TO` edge, which is correctly excluded.

## Taxonomies (`data/taxonomies.js`)

- `CATEGORIES` / `OCCASIONS` are generated from `js/products.js`'s existing `CATEGORIES`/`OCCASIONS` constants (not re-typed), so the graph's vocabulary cannot silently diverge from what the live site already filters on.
- `TAG_IDS` (the union of both) exists because `js/guides.js`'s `tags` field conflates category values (e.g. `"Sneakers"`) with occasion values (e.g. `"Travel"`) in one array — a real, pre-existing legacy quirk, not something this graph introduces. See `docs/CURRENT_DATA_TO_GRAPH_MAPPING.md`.
- `MATCH_TYPES`, `PRICE_STATUSES`, `OFFER_STATUSES` are commerce-fact vocabularies; the first two are copied verbatim from `js/products.js`'s existing `exactOrSimilar`/`priceStatus` values, the third (`published`/`unpublished`) is new and mirrors the live UI's own "Shop →" vs. "Link coming soon" branching on `affiliateUrl`.

## Validation

`scripts/validate-knowledge-graph.mjs` (zero dependencies, same style as `scripts/validate-content-data.mjs`) enforces every structural rule named in the issue: unique ids per entity type, unique guide slugs, every id reference resolves, taxonomy/vocabulary membership for categories/tags/predicates/confidence/verification, outfit item resolution, no duplicate normalized relationships, no self-`ALTERNATIVE_TO`, no circular `REPLACES` chains, and that commerce facts stay `null`/`unpublished` rather than fabricated. See that script's own header comment for the full, authoritative list — this document summarizes it but the script is the source of truth for exactly what's checked.

## What this version deliberately does not do

- Does not change what any `.dc.html` page reads from (`js/products.js`/`js/guides.js` are untouched and still canonical).
- Does not introduce multi-retailer offers, click tracking, or affiliate redirects (`ARCHITECTURE.md` Recommendation 4) — the Offer entity's shape anticipates that but stays 1:1 with Product in v1.
- Does not build the compatibility-rule "Outfit Intelligence" graph `ARCHITECTURE.md` Recommendation 5 describes (which outfits are stylistically valid to *generate*, not just which ones already exist) — it only gives today's hand-authored outfits stable identity, which is a prerequisite for that, not that system itself.
- Does not add a Collection record (none exist truthfully in the current data).
- Does not touch closets, wishlists, search, or an AI Stylist — all explicitly downstream in `ROADMAP.md`.
