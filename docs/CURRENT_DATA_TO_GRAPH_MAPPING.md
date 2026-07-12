# WearWyzer — Current Data → Knowledge Graph Mapping

Field-by-field audit of every field in `js/products.js` and `js/guides.js` against the entity model in `docs/KNOWLEDGE_GRAPH_V1.md`. Classification vocabulary (`data/taxonomies.js REVIEW_STATUSES`):

- **Direct mapping** — copied verbatim onto a graph entity field, no reinterpretation.
- **Derived field** — computed from one or more legacy fields; the graph value is a function of the legacy data, not the legacy data itself.
- **Legacy compatibility field** — exists in the graph, or in `data/adapters.js`, only to let the adapter reproduce the legacy shape; not part of the "real" graph model going forward.
- **Missing canonical data** — no truthful source for this exists yet; graph field is explicit `null`/`[]`, never guessed.
- **Ambiguous / editorial review required** — a human needs to resolve which interpretation is correct before this can be trusted as a graph fact.

No field below was dropped silently — every legacy field is accounted for in exactly one of the tables below or explicitly named as intentionally not carried forward, with the reason stated.

## `js/products.js` — 33 product records + `CATEGORIES`/`OCCASIONS` constants

| Legacy field | Graph destination | Classification | Notes |
|---|---|---|---|
| `id` | `data/products.js` → `product.id` | Direct mapping | Preserved verbatim — every outfit `productId` reference, `featuredInGuides` entry, and `relatedProducts` entry depends on this staying stable. |
| `name` | `product.name` | Direct mapping | — |
| `brand` (string, `""` allowed) | `data/brands.js` brand entity + `product.brandId` (`null` if `""`) | Derived field | `""` means "any comparable brand works" per the file's own header comment — not "unknown," so it correctly maps to `brandId: null`, not a missing-data flag. |
| `category` (string) | `product.categoryId` (slug) | Direct mapping | Validated against `data/taxonomies.js CATEGORY_IDS`, itself generated from this same file's `CATEGORIES` constant — see that table below. |
| `colorway` | `product.colorway` (`null` if empty) | Direct mapping | — |
| `image` | `product.image` | Direct mapping | Path string, not validated for existence by this graph (that's `scripts/qa-static-site.mjs`'s job, out of scope here). |
| `price` | `data/offers.js` → `offer.price` | Direct mapping | Moved off Product onto Offer — see "why a graph" in the spec doc re: separating descriptive vs. commerce facts. |
| `priceStatus` | `offer.priceStatus` | Direct mapping | — |
| `retailer` (string, `""` allowed) | `data/retailers.js` retailer entity + `offer.retailerId` (`null` if `""`) | Derived field | — |
| `affiliateUrl` (string, `""` = unset) | `offer.affiliateUrl` (`null` if `""`) | Legacy compatibility field on the way in, direct fact on the way out | The graph normalizes `""` → `null` (explicit absence, not an empty string standing in for absence); `data/adapters.js` converts back to `""` for legacy reproduction. |
| `exactOrSimilar` | `product.matchType` / `offer.matchType` | Direct mapping | Kept as the exact display strings (`"Exact item"`/`"Similar option"`), not renamed to a code-style id, since they're used verbatim as UI copy today. |
| `tags` (occasion strings) | `product.tags` | Direct mapping | Validated against `OCCASION_IDS`. |
| `featuredInGuides` | `product.featuredInGuideIds` **and** `FEATURED_IN` relationship edges | Direct mapping (field) / Derived (edges) | Kept as a flat field on Product *and* expressed as graph edges, deliberately redundant — see spec doc's entity model table. |
| `lastChecked` (string, `""` = never) | `offer.lastChecked` (`null` if `""`) | Direct mapping | — |
| `profile.type` | `product.profile.type` | Direct mapping | Only 3 of 33 products have a `profile` block at all (`on-cloud-x4`, `nb-9060-breakfast-tea`, `nb-530-turtledove` — the three guide hero products); `product.profile` is `null` for the other 30, not an empty object. |
| `profile.whyPeopleAsk` | `product.profile.whyPeopleAsk` | Direct mapping | — |
| `profile.bestFor` | `product.profile.bestFor` | Direct mapping | — |
| `profile.stylingDifficulty` | `product.profile.stylingDifficulty` | Direct mapping | — |
| `profile.worksWith` | `product.profile.worksWith` | Direct mapping | Free-text category/style descriptions (e.g. `"Chinos"`, `"Light denim"`), **not** product-id references — left as descriptive strings, not resolved against `data/products.js`, because the source data itself doesn't reference specific product ids here. |
| `profile.avoid` | `product.profile.avoid` | Direct mapping | Same as `worksWith` — descriptive strings, not references. |
| `profile.alternatives` (product-id array) | `ALTERNATIVE_TO` relationship edges (not a Product field) | Ambiguous / editorial review required | Only populated for `on-cloud-x4` → `["light-jeans"]`. The field's own source comment (`// TODO: add real alternative shoe IDs as they're covered`) marks it as an incomplete placeholder, and a shoe → jeans "alternative" pairing reads as either mislabeled data or a placeholder value rather than a genuine styling-alternative claim. **Not corrected or removed here** — `CLAUDE.md`'s scope-discipline rule says not to fix unrelated data quality issues as a drive-by of this issue — but carried forward at `confidence: "unverified"`, `verificationStatus: "draft"` so it is excluded from `isPubliclyRecommendable()` until a human confirms or replaces it. Recommend a follow-up issue to either populate real alternatives across more products or drop this field from `js/products.js` if it's not going to be maintained. |
| `CATEGORIES` (module-level constant) | `data/taxonomies.js CATEGORIES` | Direct mapping | Imported, not re-typed — see that module's header. Includes `"Shoes"`, which no current product actually uses (`"Sneakers"` is used instead) — kept in the taxonomy as an approved-but-currently-unused category, since removing it would be an unrelated cleanup of `js/products.js`, out of scope here. |
| `OCCASIONS` (module-level constant) | `data/taxonomies.js OCCASIONS` | Direct mapping | Imported, not re-typed. |

## `js/guides.js` — 3 published guides + 1 `comingSoon` placeholder

| Legacy field | Graph destination | Classification | Notes |
|---|---|---|---|
| `id` | `data/guides.js` → `guide.id` | Direct mapping | Preserved verbatim. |
| `title` | `guide.title` | Direct mapping | — |
| `slug` (`.dc.html` filename, `""` for the placeholder) | `guide.slug` (`null` if `""`) | Direct mapping | Validated for cross-guide uniqueness by `scripts/validate-knowledge-graph.mjs`. |
| `productName` | *(not carried forward as a field — see `heroProductId` below)* | Derived field (via `heroProductId`) | Verified identical, for all 3 published guides, to `getProductById(heroProductId).name` — see next row. Carrying both would risk them drifting apart with no validator catching it, so only the id reference is kept; `data/adapters.js` reconstructs the string from it (falling back to the legacy literal `"TBD"` when `heroProductId` is `null`, matching the placeholder guide's current value). |
| *(no legacy field — new)* | `guide.heroProductId` | Derived field | Computed as the one `productId` common to every outfit in the guide, if exactly one exists (see `data/guides.js` header for the algorithm). Deliberately *not* computed by fuzzy-matching `productName` text against product names — `CLAUDE.md` forbids guessing, and a structural derivation from real outfit-item references is a fact, not a guess. Resolves to `null` for the `comingSoon` placeholder (zero outfits, so no common product exists) rather than a fabricated guess. |
| `brand` | `guide.brandId` (`null` if `""`) | Derived field | Resolved against `data/brands.js`, same as `product.brand`. |
| `colorway` | `guide.colorway` | Direct mapping | — |
| `category` | `guide.categoryId` | Direct mapping | — |
| `verdict` | `guide.verdict` (`null` if absent) | Direct mapping | Absent entirely (not `""`) on the `comingSoon` placeholder — graph normalizes to explicit `null`, see "Intentional adapter differences" below. |
| `description` | `guide.description` | Direct mapping | — |
| `coverImage` | `guide.coverImage` | Direct mapping | — |
| `slideImages` | `guide.media.slides` | Direct mapping | Renamed/nested (`media.slides` instead of a bare top-level array) to leave room for other media types later without another top-level rename; `data/adapters.js` flattens it back for legacy reproduction. |
| `outfitCount` | `guide.outfitCount` | Derived field | Recomputed as `outfitIds.length` rather than trusted as a hand-maintained integer — this is strictly safer (cannot drift from the actual outfit count) and happens to match the legacy value exactly for all 4 records today. |
| `bestFor` | `guide.bestForSummary` | Direct mapping | Free-text summary string (e.g. `"Business casual · Everyday · Date night · Travel"`), kept as prose — not parsed into a tag array, since it's editorial copy, not a structured field, and parsing it would be an interpretation the source data doesn't support. |
| `outfits[]` | `data/outfits.js` records, referenced via `guide.outfitIds` | Direct mapping (via a new entity) | See Outfit table below. |
| `styleNotes` | `guide.styleNotes` | Direct mapping | — |
| `relatedProducts` | `guide.relatedProductIds` **and** `RELATED_TO` relationship edges | Direct mapping (field) / Derived (edges) | Same deliberate redundancy as `featuredInGuides` above. |
| `instagramUrl` (`""` = not yet published) | `guide.instagramUrl` (`null` if `""`) | Direct mapping | — |
| `publishedDate` (`""` for the placeholder) | `guide.publishedDate` (`null` if `""`) | Direct mapping | — |
| `tags` | `guide.tags` | Direct mapping | **Ambiguous, flagged, not corrected:** this array conflates category values (`"Sneakers"`) and occasion values (`"Travel"`, `"Everyday"`, ...) in one list — a pre-existing legacy quirk. The graph validates it against the *union* of both taxonomies (`TAG_IDS`) rather than fabricating a split the source data doesn't make. A future content-model change could split this into `categoryTags`/`occasionTags`; not done here (scope discipline). |
| `comingSoon` | `guide.comingSoon` | Direct mapping | — |

### Outfit sub-records (`guides[].outfits[]`)

| Legacy field | Graph destination | Classification | Notes |
|---|---|---|---|
| `name` | `data/outfits.js` → `outfit.name` | Direct mapping | Also used to derive `outfit.id` (`${guideId}--${slug(name)}`) — Derived field for the id specifically. |
| `when` | `outfit.when` (`null` if absent) | Direct mapping | — |
| `why` | `outfit.why` (`null` if absent) | Direct mapping | — |
| `items[].name` | `outfit.items[].label` | Direct mapping | — |
| `items[].productId` | `outfit.items[].productId` (`null` if it doesn't resolve) **or** `outfit.items[].editorialLabel` | Direct mapping | In the current data, all 63 outfit items across all 3 guides resolve to a real product — confirmed by re-running the reference check `scripts/validate-content-data.mjs` already performs. The `editorialLabel` fallback path exists for future data that doesn't resolve, and is exercised by `scripts/validate-knowledge-graph.mjs`'s own documented self-test rather than by any current record. |

### A note on data quality that is *not* what it used to be

`docs/FEATURE_INVENTORY.md` (an earlier audit pass) documents three specific wrong `productId` mappings in `nb9060-zara-polo`'s outfits ("Silver Bracelet" → sunglasses, "Baseball Cap" → a crossbody bag, "Minimal Watch" → sunglasses) and a broken/missing `guide-barrel-pants-nb530.dc.html` controller. **Neither is present in the current `js/guides.js`/`js/products.js`** — re-reading both files directly (not relying on that earlier audit's claims) shows all three guides fully populated, all outfit items correctly labeled, and `scripts/validate-content-data.mjs` reporting zero warnings and zero errors against the data as it exists now. That audit document is stale as of this mapping; updating it is outside this issue's scope (it documents a past state, not a currently-true claim this issue relies on), but it's worth flagging so a future reader doesn't assume this mapping doc missed those three known issues — they were already fixed before this issue started.

## Missing canonical data (exists as an entity type, zero real records)

- **Collections** (`data/collections.js`): no grouping concept beyond guide-scoped `relatedProducts` exists anywhere in the current site. Zero records, per `CLAUDE.md`'s "do not invent missing data" rule.
- **Brand/Retailer metadata** (`website`, description, logo): `data/brands.js`/`data/retailers.js` entities exist (derived from product `brand`/`retailer` strings) but every metadata field beyond `name` is explicit `null` — none of that data exists in `js/products.js` today.

## Intentional adapter differences (see `data/adapters.js` header)

`data/adapters.js` reconstructs the legacy `js/products.js`/`js/guides.js` shapes from the graph for comparison (`scripts/compare-legacy-adapter.mjs`). Two classes of difference are expected and not bugs:
1. **Explicit-empty vs. omitted-key.** The `comingSoon` guide placeholder omits keys like `verdict`, `outfits`, `styleNotes`, `relatedProducts`, `instagramUrl`, and `slideImages` entirely rather than setting them to `""`/`[]`. The graph always models "no value" as an explicit `null`/`[]` field, and the adapter always emits the key. `scripts/compare-legacy-adapter.mjs`'s diff treats omitted-and-empty as equivalent so this doesn't produce noise on every run.
2. **`profile.alternatives` ordering.** Reconstructed from `ALTERNATIVE_TO` relationship edges rather than the legacy array directly; order is preserved by construction (single edge in v1's data), but is not guaranteed by the relationship model in general the way a plain array's order is.

No other differences are expected. Any the comparison script reports beyond these two categories should be treated as a real bug in either `data/*.js` or `data/adapters.js`, not documented away.
