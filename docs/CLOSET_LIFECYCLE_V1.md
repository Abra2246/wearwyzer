# Closet lifecycle and Wear DNA evidence contract v1

## Purpose

Ownership alone is not enough for trustworthy styling. WearWyzer must know
whether an item is actually worn, how it fits, its condition, and whether it has
become forgotten—without turning a private closet into public tracking data.

This provider-agnostic fixture contract defines that evidence before production
accounts or analytics exist.

## Private lifecycle record

Each confirmed wardrobe item may have one versioned record containing:

- canonical wardrobe item and product references;
- condition;
- acquisition date;
- optional amount paid;
- fit note;
- explicit wear events;
- explicit correction history;
- creation and update timestamps.

Every private field carries provenance, confidence, and update time. Corrections
are immutable versioned events and visibly replace earlier values.

## Deterministic intelligence

From explicit lifecycle evidence, WearWyzer may calculate:

- `never-worn`: no wear events;
- `active`: last wear is within 180 days;
- `forgotten`: last wear is more than 180 days ago;
- wear count;
- last-worn timestamp;
- cost per wear when and only when an explicit paid amount and at least one wear
  event exist.

WearWyzer never invents a purchase price, current value, resale value, wear
event, or fit judgment.

## Minimized consumer evidence

The website, recommendation response, and future extension may receive:

- item reference;
- lifecycle version;
- wear state;
- coarse wear-count bucket;
- coarse recency bucket;
- condition.

They must not receive exact purchase price, fit-note text, occasion text, exact
wear dates, or the event/correction ledger.

## Validation and fail-closed rules

- Unsupported conditions and invalid prices fail.
- Future acquisition and wear dates fail.
- Wear before acquisition fails.
- Duplicate wear timestamps fail.
- Empty corrections fail.
- State transitions are immutable.
- Cost per wear remains `null` without sufficient explicit evidence.
- Minimized evidence has an exact allowlist and privacy regression.

The implementation is covered by nine deterministic contract tests. The full
repository baseline is 558 passing tests plus content, Knowledge Graph,
hero-product, HTML metadata, static-site, and diff validation.

## Data lifecycle

This is a contract-only fixture slice. A future private profile service owns
storage, export, retention, correction, and deletion. Completed account deletion
must remove lifecycle records and events; derived public evidence must become
unavailable after its source record is removed.

## Production gates

No real account, analytics, retailer/email/receipt import, background location,
production database, market pricing, or user tracking is authorized. Provider
selection, retention policy, and real personal-data processing remain founder
and legal/privacy decisions.
