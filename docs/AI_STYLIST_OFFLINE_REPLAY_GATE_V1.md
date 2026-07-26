# AI Stylist offline replay gate v1

## Purpose

This gate lets WearWyzer compare synthetic candidate answers before a live
provider, credential, prompt, or real wardrobe is allowed into the trusted
Stylist boundary.

## Trust model

The candidate supplies only a closed envelope containing:

- a synthetic provider alias;
- fixture and candidate versions; and
- one candidate draft for every trusted evaluation scenario.

The gate owns the request, evidence, expected outcome, thresholds, and
evaluation logic. Candidates cannot replace those trusted facts. Unknown
fields, private evidence, secrets, incomplete portfolios, external-action
intents, invalid citations, invented ownership or product facts, and
non-repeatable outputs fail closed.

## Comparison rule

Only candidates scoring 100% on grounding, citation completeness, abstention
correctness, privacy, external-action safety, and repeatability are eligible.
One eligible candidate is selected; multiple eligible candidates remain an
explicit tie; no eligible candidates produces `no-trusted-candidate`. The gate
does not add hidden style preferences or invent a winner.

## Output boundary

The sanitized report contains only the provider alias, fixture version,
scenario outcomes, trust metrics, failed scenario IDs, and failure reasons. It
does not return drafts, prompts, request inputs, profile facts, wardrobe facts,
credentials, or evidence payloads.

## Deferred decisions

Live provider selection, credentials, model and prompt experiments, paid calls,
real user data, production telemetry, human preference scoring, publishing,
external actions, and likeness generation remain outside this slice.

## Validation evidence

Eight focused replay tests cover complete six-intent trust success, byte-stable
sanitized reporting, an exact unsafe-scenario failure, exclusion of an unsafe
candidate, explicit ties, closed-schema privacy rejection, incomplete and
unknown portfolio rejection, and a no-winner outcome. The full repository gate
passes 611/611 deterministic tests plus every content, graph, hero-product,
metadata, static-site, and diff check.
