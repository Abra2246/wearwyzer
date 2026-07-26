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
