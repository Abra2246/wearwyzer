# Daily Outfit Intent v1

Status: fixture-only, deterministic, provider-neutral, read-only, and built on
the accepted Personalized Outfit Set Recommendation contract.

## Purpose

This boundary translates an explicit “what should I wear?” request into the
shared outfit-set intelligence without collecting live location, calendar,
exact itinerary, or a full private wardrobe.

## Explicit minimized context

The request includes one allowlisted:

- occasion;
- season class;
- weather class;
- dress code;
- availability window;
- desired set size of two or three; and
- already-minimized outfit candidates.

Unknown season/weather, ambiguous dress code, and unknown or stale availability
require review. Contradictory season/weather or dress-code/occasion evidence
abstains. The boundary never fills gaps with inferred context.

## Delegation

When explicit context is coherent, candidate qualification, diversity,
owned-first preference, ties, insufficiency, and abstention are delegated to
the accepted Outfit Set Recommendation contract. This boundary does not create
a second ranking policy.

## Minimized result and safety

The result contains the explicit context summary, stable reasons, status, and
the minimized outfit-set result. It excludes live geolocation, calendar,
contacts, exact address, itinerary text, health/body data, full profile or
wardrobe, prices, retailers, affiliate status, commission, analytics,
credentials, network calls, persistence, purchasing, and every external
action.

## Fixture review journey

The unlinked, `noindex` route
`daily-outfit-fixture.dc.html?ww_daily_outfit=1` makes the boundary reviewable
without expanding it. Nine deterministic modes cover:

- ready two- and three-outfit recommendations;
- unknown weather;
- ambiguous dress code;
- stale availability;
- weather/season and dress-code/occasion conflicts;
- an Outfit Set selection-boundary tie; and
- insufficient trustworthy candidates.

The UI delegates every decision to this contract and only renders explicit
context, stable reasons, safety policy, and the minimized Outfit Set evidence.
Changing a mode clears the prior result. Reset returns to the two-outfit
default and restores focus. No live context, real profile or closet, storage,
network, analytics, commerce, or external action is available.
