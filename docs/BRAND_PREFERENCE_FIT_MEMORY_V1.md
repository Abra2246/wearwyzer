# Brand Preference and Fit Memory v1

Status: fixture-only, deterministic, provider-neutral, and read-only.

## Purpose

This contract lets future website, app, and extension clients understand which
brands a user explicitly likes, avoids, wears most, aspires to, or knows fit
well. Brand preference personalizes an otherwise equally strong recommendation;
it never replaces product quality or verified fit.

## Evidence and precedence

The boundary accepts:

- explicit favorite, avoided, best-fitting, most-worn, and aspirational roles;
- minimized inferred signals with allowlisted provenance and confidence;
- versioned explicit add/remove corrections; and
- coarse known-brand fit outcomes tied to stable owned-item references.

Explicit input and corrections outrank inference. Corrections are applied in
strict version order, so a later record can visibly reverse an earlier one.
Inferred signals below the accepted confidence threshold remain absent.

An avoided brand is excluded until the user explicitly removes that role.
Avoidance combined with a positive role is `review-required`, not silently
resolved.

## Recommendation influence

The fixed precedence is:

1. styling quality;
2. WearWyzer usefulness;
3. editorial credibility;
4. verified fit; and
5. brand preference.

Brand preference is therefore `tie-break-only` after quality and fit are equal.
Commercial influence is disabled.

## Minimized output

The response contains corrected brand roles with explicit/inferred provenance,
confidence, evidence codes, stable fit-memory references with coarse outcomes,
conflicts, and the fixed influence policy.

It excludes browsing history, raw wear ledgers, purchase/return history,
private notes, account identifiers, sensitive profile data, prices, retailer
preferences, affiliate status, commission, and popularity.

No real user data, account, analytics, browsing collection, production storage,
retailer integration, purchase, network call, paid generation, Chrome
permission, publication, or likeness workflow is introduced.
