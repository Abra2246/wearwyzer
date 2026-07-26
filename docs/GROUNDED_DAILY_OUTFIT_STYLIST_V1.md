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

## Production gates

No model or provider call, live context access, production account/storage,
real user data, Chrome permission, affiliate redirect, notification, social
publication, purchase execution, or personalized likeness generation is
authorized by this contract.
