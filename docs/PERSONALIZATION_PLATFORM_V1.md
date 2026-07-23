# Personalization platform v1 — implementation specification

## Purpose

Define the smallest stable contracts behind accounts, digital wardrobes, Style DNA, Fit DNA,
purchase evaluation, the AI Stylist, and future web/app/extension synchronization. This document
does not authorize production collection of personal data or personalized image generation.

## First vertical slice

A feature-flagged prototype must allow a test user to:

1. create a basic style and fit profile;
2. add at least five wardrobe items manually or from canonical product search;
3. select one prospective canonical product;
4. receive an explainable compatibility result;
5. receive two or three outfits that use owned items first;
6. see redundancy, gap coverage, versatility, Outfit Unlocks, and purchase ROI signals;
7. receive `buy`, `wait`, `choose-alternative`, or `skip` with rationale and confidence;
8. export and delete all prototype personal data.

Camera ingestion, production auth, personalized likeness imagery, extension publication, and
automated purchasing are explicitly outside this slice.

## Service boundaries

```text
Website / App / Extension
          |
          v
Authenticated profile + wardrobe API
          |
          +--> canonical product and offer API
          +--> deterministic compatibility service
          +--> outfit candidate/ranking service
          +--> explanation and AI Stylist layer
```

The generative layer explains and converses over structured results; it does not invent products,
scores, sizes, ownership, prices, or offers.

## Core entities

### UserAccount

- `id`, authentication-provider subject, created/updated timestamps;
- locale, market, timezone;
- status and deletion/export state.

Do not store authentication secrets in application tables.

### UserProfile

- audience/presentation preferences;
- climate, lifestyle, common occasions;
- category budgets and shopping constraints;
- explicit favorite, most-worn, best-fitting, aspirational, and avoided brands;
- preferred aesthetics, colors, silhouettes, materials, formality, and fashion-risk tolerance;
- provenance and last-updated timestamp per signal group.

### SizeProfile / FitDNA

- category and regional sizes;
- measurements only when explicitly supplied;
- preferred fit by category;
- brand/product fit observations;
- confidence, evidence count, and user corrections.

Fit results are guidance, never guarantees. Sensitive measurements use encrypted storage and
restricted access.

### WardrobeItem

- personal ID and optional canonical product/variant ID;
- intake method: manual, search match, camera candidate, purchase import, extension;
- category, color, material, silhouette, size, condition, season, occasion;
- ownership, wear count, last worn, favorite/archive state;
- user photos stored separately with consent and retention metadata;
- canonical-match confidence and provenance.

An unmatched personal item remains valid. The system must not force a false catalog match.

### StyleDNA

Versioned explicit and inferred signals:

- aesthetics, palettes, silhouettes, formality, brands, price behavior;
- positive/negative outfit feedback;
- owned, worn, saved, returned, ignored, and corrected signals;
- confidence, decay, provenance, and explainability.

Explicit user choices outrank inferred behavior and are editable.

### ProductCandidate

- canonical product/variant ID and exact/similar/unknown match state;
- source and freshness;
- current verified offers, if any;
- category, palette, silhouette, material, occasion, season, fit evidence.

### OutfitCandidate

- item roles and IDs;
- owned/prospective/missing status per item;
- occasion/season compatibility;
- score components, hard-rule failures, and explanation evidence.

### PurchaseEvaluation

- user, wardrobe snapshot version, candidate, timestamp;
- compatibility, versatility, gap coverage, redundancy, Outfit Unlocks;
- estimated cost-per-wear range only when supported inputs exist;
- purchase ROI, recommendation enum, confidence, and reason codes;
- alternative product IDs and offer freshness.

## Scoring contract

All scores are versioned and decomposable. No single opaque model output becomes canonical.

### Compatibility

Weighted evidence across palette, silhouette, formality, season/climate, occasion, brand/fit
preference, and compatibility with high-use owned items. Hard incompatibilities are separate from
soft preferences.

### Outfit Unlocks

Count distinct complete outfit candidates that become valid when the prospective item is added.
Use canonicalized combinations and minimum quality thresholds to prevent inflated permutations.

### Redundancy

Compare category, function, color, silhouette, season, and outfit neighborhood with owned items.
Return similar item IDs and reasons, not only a percentage.

### Gap coverage

Measure whether the item fills a category, occasion, climate, color, or layering gap observed in
the wardrobe and lifestyle profile. A missing category is not automatically a real user need.

### Versatility

Measure qualified seasons, occasions, formality range, palette compatibility, layering roles, and
number of high-quality outfit neighborhoods.

### Purchase ROI

Combine Outfit Unlocks, expected use, gap coverage, versatility, price evidence, redundancy
penalty, and confidence. Affiliate commission is never a scoring input.

## Recommendation policy

Allowed outcomes:

- `buy`: strong evidence, useful addition, acceptable value;
- `wait`: potentially useful but price, season, confidence, or wardrobe timing is weak;
- `choose-alternative`: concept is useful but another verified option fits better;
- `skip`: redundant, incompatible, poor value, or unsupported by evidence.

Every result includes supporting and opposing evidence plus uncertainty. “Do not buy” is a valid
and important product outcome.

## Camera and search ingestion

### Search

Canonical search returns exact products, variants, and clearly labeled similar candidates. The
user confirms the match before it becomes canonical wardrobe data.

### Camera

The future camera flow:

1. request camera/photo consent;
2. isolate garment and extract non-sensitive visual attributes;
3. optionally read a label/barcode with permission;
4. propose candidates with confidence;
5. require confirmation or create an unmatched personal item;
6. retain the original image only under the user's chosen retention setting.

Face/body imagery is not required for garment inventory.

## AI Stylist

The AI Stylist may interpret intent, ask clarifying questions, explain deterministic results, and
compose plans. Tools provide wardrobe, product, outfit, weather, occasion, and offer data.

It must:

- prefer owned items;
- cite which wardrobe items and facts informed advice;
- distinguish verified, inferred, and unknown;
- never guarantee fit or availability;
- avoid body-shaming, sensitive-attribute inference, or manipulative purchase pressure;
- honor budgets, avoided brands/materials, and accessibility needs.

## Surface synchronization

- Server data is canonical for authenticated profile, wardrobe, consent, and evaluations.
- Website, mobile app, extension, and portal consume versioned APIs.
- Offline clients use conflict-aware sync and never silently overwrite newer server edits.
- Extension receives the minimum result needed for the active page, not the full wardrobe.
- Mission Control receives aggregate operational metrics, never private wardrobe contents.

## Privacy and user rights

- Explicit, purpose-specific consent for wardrobe photos, measurements, behavior learning, and
  personalized image generation.
- Data minimization and separate retention controls for originals versus derived attributes.
- Export in a documented machine-readable format.
- Account and item deletion with clear completion status.
- Correction controls for Style DNA, Fit DNA, matches, and recommendations.
- No sale of private wardrobe or measurement data.
- No training on private photos or likeness without separate opt-in consent.
- Audit logs for sensitive access and model/tool actions.

## Personalized image safeguards

Personalized likeness generation is a later, independently approved capability. It requires:

- explicit consent and revocation;
- clear generated-image labeling;
- no body reshaping presented as expected fit;
- no guaranteed sizing based on an image;
- secure source-image handling and deletion;
- age and sensitive-content safeguards;
- confidence and limitations shown beside the output.

## Prototype acceptance criteria

- Deterministic fixture users and wardrobes.
- Explainable, versioned scores and reason codes.
- Owned-first outfit generation.
- Honest unknown/low-confidence behavior.
- Export/delete coverage.
- No live credentials, paid calls, or public indexing.
- Unit, integration, privacy-boundary, and negative tests.
- Feature flag defaults off in production.

