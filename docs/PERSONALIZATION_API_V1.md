# Personalization recommendation API v1

## Purpose

Define the minimum versioned contract that future WearWyzer website, mobile,
and Chrome-extension clients may use to request one personalized purchase
decision without receiving or owning a user's complete profile or wardrobe.

This is a fixture-only architectural slice. It does not deploy an endpoint,
authorize production authentication, or collect real personal data.

## Source-of-truth boundary

| Fact | Canonical owner | Client visibility |
| --- | --- | --- |
| Product identity, source, price, availability | Product and Offer graph | Active candidate only |
| Profile, Style DNA, Fit DNA | Future authenticated profile service | Stable reference plus derived explanation only |
| Wardrobe inventory | Future authenticated wardrobe service | Only items used in returned active outfits |
| Scoring policy | Versioned personalization service | Version, components, reason codes, confidence |
| Affiliate offer | Verified offer service | Active verified offer only when available |
| Operational health | Mission Control | Aggregates only; never wardrobe contents |

Browser clients are presentation and interaction surfaces. They never become a
second canonical wardrobe, product, offer, or recommendation store.

## Request contract

`personalization-request-v1` contains only:

- a unique request ID;
- the required scoring version;
- a profile reference;
- a wardrobe snapshot reference;
- the active product ID;
- explicit exact, similar, or unknown match state and confidence;
- explicit personalization consent;
- request timestamp.

The request rejects embedded profile or wardrobe payloads. Future authenticated
servers resolve the references after authorization.

## Response contract

`personalization-response-v1` returns:

- stable request and scoring versions;
- profile and wardrobe snapshot references;
- active candidate facts and match state;
- recommendation and confidence;
- supporting and opposing evidence;
- decomposed compatibility, versatility, gap, redundancy, Outfit Unlock, and
  Purchase ROI scores;
- only the owned, prospective, or missing items used in the active outfit
  suggestions;
- product-source verification time and evaluation time.

It intentionally omits:

- the complete wardrobe;
- Style DNA or Fit DNA source signals;
- measurements;
- budgets and brand preference lists;
- wear history;
- unrelated saved products;
- authentication data;
- affiliate credentials.

## Fail-closed policy

The adapter returns an error response before scoring when:

- the schema or scoring version is unsupported;
- personalization consent is absent;
- the product match is unknown or ambiguous;
- the profile or wardrobe snapshot reference does not resolve;
- fewer than five valid wardrobe items exist;
- canonical product evidence is missing;
- product-source evidence is older than 30 days;
- a generated response violates the closed schema or privacy boundary.

## Exact, similar, and unknown products

- `exact`: confidence must be at least 0.95.
- `similar`: may be evaluated only at confidence 0.80 or higher and must remain
  labeled similar.
- `unknown`: confidence is zero and the request is not evaluated.

No client may silently upgrade a similar or unknown product to exact.

## Extension data-minimization rules

The future extension may cache:

- active product ID and match state;
- current evaluation response;
- scoring version and source freshness;
- user-approved wishlist state.

It may not cache the full wardrobe, body measurements, raw Style DNA signals,
authentication secrets, browsing history, or unrelated evaluations. Browser
permissions and store publication remain separate founder decisions.

## Fixture evidence

The current adapter resolves:

- profile `fixture-user-menswear-01`;
- wardrobe snapshot `fixture-wardrobe-snapshot-01`;
- prospective product `adidas-samba-og-b75806`.

It uses the deterministic engine from `scripts/personalization-engine.mjs`.
There is no server, network request, paid call, or real-user record.

## Next implementation boundary

After this contract is reviewed:

1. choose the production authentication and storage architecture;
2. complete privacy/legal review for real profile and wardrobe data;
3. implement authenticated server-side reference resolution;
4. add user correction, export, deletion, consent, and audit events;
5. expose the same contract to signed-in web clients;
6. begin a Chrome-extension proof only after browser permissions are approved.
