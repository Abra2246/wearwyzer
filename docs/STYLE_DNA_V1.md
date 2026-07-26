# Style DNA v1

Status: fixture-only, deterministic, provider-neutral, read-only, and not a
production profile service.

## Purpose

Style DNA is the editable, explainable preference layer shared by the future
WearWyzer website, app, and extension. It describes how a person prefers to
dress without turning hidden behavior, popularity, or affiliate economics into
an opaque recommendation.

## Dimensions

The closed v1 vocabulary includes:

- aesthetic;
- palette;
- silhouette;
- formality;
- layering;
- material;
- occasion; and
- fashion-risk tolerance.

Each canonical signal has a value, positive or negative sentiment, provenance,
confidence, confidence band, and minimized evidence codes.

## Evidence and precedence

Explicit user choices are confidence `1.0` and outrank inference. Versioned
explicit corrections may set, change, remove, and later reverse a signal.

Inference accepts only allowlisted minimized summaries. It never accepts raw
wardrobe, browsing, shopping, purchase, return, or private-note history.
Confidence decays deterministically:

- 0–30 days: full confidence;
- 31–90 days: 85%;
- 91–180 days: 65%; and
- older than 180 days: excluded.

Any decayed inference below `0.70` remains absent. Future-dated evidence fails
closed.

When accepted inference contradicts an explicit choice, the explicit choice
remains canonical and the disagreement becomes `review-required`.

## Exploration

Exploration mode is an explicit, temporary set of style directions. It never
changes canonical Style DNA. Exploring a value that the canonical profile
explicitly rejects is visible as a review conflict, not silently resolved.

## Minimized result

The response contains only:

- canonical signals;
- explicit, inferred, or correction provenance;
- confidence and allowlisted evidence codes;
- inference accepted/ignored counts;
- conflicts;
- temporary exploration directions; and
- fixed user-control policy.

It contains no raw wardrobe or behavioral history, identity, private notes,
protected attributes, prices, retailers, affiliate status, commission,
popularity, analytics, credentials, network calls, or external actions.

Real accounts, persistence, collection, model training, production
personalization, and commerce integration require later authenticated,
consented, and separately approved work.
