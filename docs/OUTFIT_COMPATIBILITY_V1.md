# Outfit Compatibility v1

Status: fixture-only, deterministic, provider-neutral, read-only, and separate
from the older purchase-evaluation prototype.

## Purpose

This contract explains why an outfit works for a person without collapsing
product truth, ownership, Fit Intelligence, Style DNA, and outfit composition
into one opaque score.

## Input boundaries

Every outfit contains exactly one top, bottom, and footwear item, with optional
outerwear and accessory roles. Each item retains:

- stable item and canonical product references;
- `owned`, `prospective`, or `missing` state;
- current, stale, or unknown product-evidence state;
- palette, silhouette, formality, material, occasion, season, layering, and
  risk-level facts; and
- verified, unknown, not-applicable, or conflicting fit state.

Style DNA signals remain a separate minimized input with explicit, correction,
or inferred provenance.

## Decomposed result

Compatibility is decomposed into:

- palette;
- silhouette;
- formality;
- material;
- occasion;
- layering;
- verified fit; and
- owned-item pairing.

Unavailable components are excluded from the weighted average and lower
evidence coverage. Missing evidence never becomes a zero score.

## Hard versus soft evidence

Hard incompatibilities remain separate from soft scores:

- conflicting fit evidence;
- missing required outfit roles;
- core items that do not support the target occasion or season; and
- a direct match to an explicit negative Style DNA signal.

Inferred negative preference is opposing evidence but cannot hard-block an
outfit. Verified fit and product truth outrank preference.

## Comparison

Two or three valid outfits may be compared. Equal leaders remain an explicit
tie. If every outfit is incompatible or insufficient, the result is
`none-qualified`; the contract never invents a winner.

## Privacy and commerce boundary

The minimized result contains scores, confidence, coverage, reason codes, hard
incompatibilities, missing-evidence codes, target, and stable item references
with ownership/evidence/fit status.

It excludes full profile or wardrobe payloads, private notes, browsing,
purchase/return history, prices, retailer preference, affiliate status,
commission, popularity, account data, analytics, network calls, purchasing,
and every other external action.
