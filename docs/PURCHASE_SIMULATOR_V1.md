# Personalized Purchase Simulator v1

Status: fixture-only, deterministic, read-only.

The simulator compares exactly two or three canonical prospective products
against the same accepted profile and wardrobe snapshot. It reuses the existing
purchase evaluator, then applies product-truth and quality gates before ranking.

## Eligibility

A candidate may be ranked only when:

- its evaluation completes;
- its canonical source is no more than 30 days old and not future-dated;
- its availability is `available`;
- its recommendation is `buy`; and
- its confidence is not low.

Unknown, stale, unavailable, and weaker candidates remain visible with a reason
but cannot silently win.

## Decision

Eligible candidates are compared on the existing explainable Purchase ROI,
which already combines compatibility, versatility, gap coverage, Outfit
Unlocks, and inverse redundancy. A unique leader is `selected`; equal leaders
remain a `tie`; if none qualifies, the recommendation is `buy-none`.

Affiliate eligibility, commission, popularity, and retailer preference are not
ranking inputs. Editorial usefulness and product truth remain authoritative.

## Minimized result

The result contains candidate IDs; minimized scores; supporting and opposing
evidence codes; source date, availability, and price-evidence state; and the
decision. It excludes the private profile, full wardrobe, affiliate fields,
commission, measurements, fit notes, prompts, and external actions.

This milestone adds no network, real user data, production storage, account,
purchase execution, publication, or Chrome permission.

## Fixture review journey

Issue #117 adds an unlinked, `noindex`, exact-flag-gated route that makes four
states reviewable: a unique selection, an exact tie, an honest `buy-none`, and
source-evidence exclusion. Changing the fixture case invalidates the prior
result; reset restores the deterministic default and keyboard focus. The route
renders no private profile/wardrobe facts and offers no commerce control.
