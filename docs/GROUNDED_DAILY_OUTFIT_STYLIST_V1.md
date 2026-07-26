# Grounded Daily Outfit Stylist response v1

Status: deterministic, provider-neutral, fixture-only, read-only, and built
only from an accepted Daily Outfit Intent result.

## Purpose

This adapter turns a minimized Daily Outfit decision into a human-readable
Stylist answer without creating a second source of outfit truth. Future
website, app, extension, and AI Stylist clients can share the same response
boundary.

## Accepted source

The adapter accepts one exact, closed `daily-outfit-intent-v1` result. It
validates:

- the Daily Outfit schema, explicit context, reasons, status, and fixed safety
  policy;
- the nested Outfit Set schema, request/evidence references, desired count,
  status, selected/tied/qualified IDs, candidate evaluations, and fixed policy;
- status consistency between the Daily Outfit and Outfit Set results; and
- that every referenced outfit exists in the minimized candidate evidence.

Unknown fields, unsupported versions, inconsistent statuses or IDs, malformed
evidence, private-shaped data, commercial fields, secrets, and action requests
fail closed.

## Response behavior

- `ready` becomes a grounded answer containing only the accepted selected
  outfit IDs.
- `review-required` remains a non-answer. Unknown, ambiguous, or stale context
  asks for explicit confirmation; an Outfit Set tie preserves every tied ID.
- `abstained` remains a non-answer. Context conflicts keep their exact reasons;
  insufficiency and none-qualified outcomes keep their accepted Outfit Set
  evidence and safe next step.

The adapter never ranks, repairs, breaks a tie, fills a missing outfit, or
promotes a non-answer.

## Minimized output

The versioned response contains:

- request/evidence version and the fixed `daily-outfit` intent;
- answer, review-required, or abstain outcome;
- deterministic title and summary;
- explicit minimized context;
- selected, tied, and qualified outfit IDs;
- stable reason codes and uncertainty;
- Daily Outfit and Outfit Set citations;
- minimized per-outfit score, evidence coverage, confidence, reasons, and
  compatibility reference;
- fixed limitations, safe next-step code, and safety policy.

It contains no raw profile or closet, location, calendar, itinerary, account,
prices, retailers, affiliate economics, credentials, provider payload,
analytics, persistence, purchasing, publishing, messaging, or external action.

## Fixture review journey

The unlinked, `noindex` route
`grounded-daily-outfit-stylist-fixture.dc.html?ww_grounded_daily_stylist=1`
makes the accepted response understandable without adding a second policy
layer. It covers:

- ready responses with two and three selected outfits;
- unknown weather, ambiguous dress code, and stale availability;
- weather/season and dress-code/occasion contradictions;
- an Outfit Set selection-boundary tie; and
- insufficient trustworthy candidates.

The journey first delegates to the accepted Daily Outfit Intent fixture, then
passes that exact accepted result into this adapter. The page renders only the
adapter output. Changing modes clears the previous response, and reset restores
the deterministic `ready-two` default and keyboard focus.

Without the exact query flag the fixture controls remain hidden. The route is
not linked from any other site page and contains no network/provider call,
live/private input, persistence, analytics, commerce, or external action.

## Fixture composer

The unlinked, `noindex` route
`daily-outfit-stylist-composer-fixture.dc.html?ww_daily_stylist_composer=1`
lets a person compose their own explicit context instead of replaying a
curated mode. Six independent allowlisted selects — occasion, season class,
weather class, dress code, availability window, and desired outfit count of
two or three — contain no free text and no hidden field. Every selection is
delegated unchanged to the accepted Daily Outfit Intent contract against one
closed, deterministic pool of four synthetic outfits, then to this adapter.
The page renders only the adapter output plus one concise clarification
sentence, derived only from the accepted `nextStep` code and `reasonCodes`,
for review-required and abstained non-answers. The clarification helper does
not alter ranking, ties, uncertainty, or abstention.

Within the closed synthetic evidence pool, `travel` deliberately produces an
exact selection-boundary tie and `event` deliberately leaves fewer trustworthy
candidates than requested. Those are fixture evidence states, not new
ranking rules, and keep both required non-answer paths visible through the
same six context fields.

Changing any field clears the previous response; reset restores the
deterministic default context (`everyday` / `transitional` / `dry` /
`smart-casual` / `today` / two outfits) and keyboard focus. Without the exact
query flag the composer controls remain hidden. The route is not linked from
any other site page and contains no network/provider call, live/private
input, persistence, analytics, commerce, or external action.

## Production gates

No model or provider call, live context access, production account/storage,
real user data, Chrome permission, affiliate redirect, notification, social
publication, purchase execution, or personalized likeness generation is
authorized by this contract.
