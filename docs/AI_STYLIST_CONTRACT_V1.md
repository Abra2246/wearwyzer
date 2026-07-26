# Grounded AI Stylist contract v1

## Purpose

The AI Stylist is the conversational layer over WearWyzer's accepted product,
wardrobe, Wear DNA, purchase-evaluation, and outfit-planning evidence. It may
interpret intent and explain recommendations, but it may not become a second
source of wardrobe or commerce truth.

This first slice is provider-agnostic, fixture-only, read-only, and
deterministic. It validates a proposed answer; it does not call a language
model.

## Supported intents

- style an owned item;
- plan for an occasion;
- evaluate a potential purchase;
- identify a wardrobe gap;
- compare options;
- explain an existing recommendation.

Shopping, purchasing, messaging, posting, booking, account mutation, and other
external actions are not supported intents.

## Evidence boundary

Accepted evidence types are versioned profile, wardrobe snapshot, Wear DNA,
product, offer, purchase-evaluation, and outfit-plan records. Each type has an
exact fact allowlist.

Every material claim:

- has a stable claim type: fact, deterministic derived signal, or editorial
  guidance;
- cites one or more supplied evidence IDs;
- uses only accepted evidence;
- identifies owned items only from a confirmed wardrobe snapshot;
- matches an allowlisted supplied fact when represented as a fact;
- carries confidence and may carry opposing evidence.

The contract rejects uncited claims, unknown citations, unowned-item claims,
and unsupported product, price, availability, sizing, or fit facts.

## Abstention

The Stylist abstains when evidence is stale, ambiguous, conflicting, missing,
or insufficient for a material answer. Abstention is a successful trustworthy
outcome, not a system failure. It includes the reason and requests current or
unambiguous evidence.

## Minimized response

Future website, app, and extension consumers receive:

- request version and intent;
- answer or abstention outcome;
- material claims, confidence, and opposing evidence;
- citation IDs plus evidence type, version, and state;
- uncertainty and a non-mutating next step.

They do not receive the private prompt, raw evidence facts, complete profile,
complete wardrobe, correction ledger, credentials, measurements, photos,
browsing history, or unrelated evaluations.

## Corrections and deletion

Explicit user correction creates a new immutable request version. Deletion
invalidates the request, removes its private prompt and evidence, and blocks
future answers from that state.

## Validation

Eleven deterministic tests cover intent and evidence allowlists, grounded
answers, missing and unknown citations, unowned-item claims, invented product
facts, stale/ambiguous/conflicting abstention, insufficient-evidence
abstention, correction precedence, privacy minimization, invalidation, and
input immutability. The repository baseline is 579 passing tests plus every
deterministic content, Knowledge Graph, hero-product, metadata, static-site, and
diff validator.

## Production gates

No live model/provider call, paid spend, real user, production authentication
or storage, calendar/location access, camera/photo workflow, affiliate
credential, Chrome permission, social publication, purchase execution, or
personalized likeness generation is authorized by this contract.
