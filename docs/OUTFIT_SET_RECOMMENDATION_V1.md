# Personalized Outfit Set Recommendation v1

Status: fixture-only, deterministic, provider-neutral, read-only, and built on
the accepted Outfit Compatibility result.

## Purpose

This contract turns trustworthy compatibility evidence into two or three
meaningfully different outfits for one intent. It rewards recombining owned
items before adding prospective pieces when outfit quality is comparable.

## Input boundary

The request contains:

- a stable request and evidence version;
- one allowlisted intent;
- a requested set size of two or three;
- two to eight stable candidate IDs;
- the accepted minimized Outfit Compatibility result for each candidate; and
- a five-part editorial formula describing silhouette, palette, layering,
  formality, and occasion execution.

It does not accept a full profile, full wardrobe, private behavior, commercial
facts, or provider output.

## Qualification gates

Every selected outfit must:

- be `compatible`;
- score at least 70;
- have at least 75% evidence coverage and high confidence;
- contain no hard incompatibility or missing evidence;
- use current product evidence and resolved fit evidence;
- contain no missing item; and
- match the requested intent.

Failing candidates remain visible with stable exclusion reasons.

## Useful variety

Outfits must differ across the complete silhouette, palette, layering,
formality, and occasion-execution formula. Repeated formulas are excluded
rather than counted as variety.

Candidates are ranked by five-point compatibility quality band, then owned-item
count, then exact compatibility score. This allows owned-first preference only
when quality is comparable. Exact ties that cross the selection boundary remain
`tie-review`; the contract never invents a winner. Fewer than the requested
number of qualified outfits returns `insufficient-candidates`, and zero returns
`none-qualified`.

## Minimized result

The result contains selected, tied, qualified, and evaluated outfit IDs;
compatibility score, coverage, confidence, ownership counts, editorial formula,
reason codes, and a stable compatibility-result reference.

It excludes raw profile/wardrobe data, private notes or behavior, prices,
retailers, affiliate status, commission, popularity, analytics, credentials,
network calls, purchasing, and every external action.
