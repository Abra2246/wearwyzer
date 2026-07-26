# Daily Stylist production data boundary v1

Status: fixture-only, deterministic, provider-neutral, and built only on the
accepted Daily Outfit Intent and Grounded Daily Outfit Stylist contracts.

## Purpose

Define the smallest provider-neutral request boundary a future authenticated
website, app, or Chrome extension can use to ask for a Daily Outfit Stylist
response without sending a complete profile, wardrobe, measurements, live
location, calendar, or other private payload. This contract closes the gap
between the explicit-context Daily Outfit Intent boundary
(`docs/DAILY_OUTFIT_INTENT_V1.md`) and a real authenticated server: it
specifies exactly what a client may send and the exact order a future server
must resolve it in. It does not create a route, endpoint, provider, database,
account, session, real user record, collection flow, or production access.

## Source-of-truth boundary

| Fact | Canonical owner | Client visibility |
| --- | --- | --- |
| Account identity and session | Authenticated account service | Own session only |
| Profile and Style/Fit DNA | Private profile service (`docs/PRIVATE_PROFILE_SERVICE_V1.md`) | Stable `profileReference` only |
| Wardrobe inventory | Private wardrobe service | Stable `wardrobeSnapshotReference` only |
| Personalization consent | Private consent service boundary | Own purpose-specific grant state, never asserted by the client |
| Outfit-set ranking, ties, insufficiency | Accepted Outfit Set / Daily Outfit Intent contracts | Delegated result only |
| Grounded response wording | Accepted Grounded Daily Outfit Stylist adapter | Delegated result only |
| Product identity, price, availability | Public product/offer graph | Never embedded in this request |

Browser, app, and extension clients remain presentation surfaces. They never
assert authorization, consent, snapshot freshness, ownership, ranking, or a
recommendation outcome — the request envelope has no field for any of those
facts, so a client cannot smuggle one in.

## Request envelope (`daily-stylist-production-boundary-v1`)

The envelope is closed: exactly these eleven fields, no more, no fewer.

| Field | Type | Constraint |
| --- | --- | --- |
| `schemaVersion` | string | exactly `daily-stylist-production-boundary-v1` |
| `requestId` | string | non-empty |
| `requestedAtIso` | string | valid ISO timestamp |
| `profileReference` | string | non-empty stable reference; never an embedded profile |
| `wardrobeSnapshotReference` | string | non-empty stable reference; never an embedded wardrobe |
| `occasion` | string | reused Daily Outfit Intent allowlist |
| `seasonClass` | string | reused Daily Outfit Intent allowlist |
| `weatherClass` | string | reused Daily Outfit Intent allowlist |
| `dressCode` | string | reused Daily Outfit Intent allowlist |
| `availabilityWindow` | string | reused Daily Outfit Intent allowlist |
| `desiredCount` | number | `2` or `3` only |

The five context fields plus `desiredCount` are the same six explicit,
allowlisted, free-text-free selections the accepted Daily Outfit Stylist
composer already exposes (`docs/GROUNDED_DAILY_OUTFIT_STYLIST_V1.md`,
"Fixture composer"). `scripts/daily-outfit-intent-contract.mjs` now exports
`DAILY_OUTFIT_CONTEXT_ALLOWLISTS`, and this boundary imports it directly
rather than redeclaring the allowlists, so the two contracts cannot silently
drift.

Any unrecognized key — an embedded profile, wardrobe, Style DNA, Fit DNA,
size, measurement, photo, or note; an exact location, weather-provider
payload, calendar, itinerary, or browsing-history value; a credential; a
commerce, affiliate, purchase, notification, or publishing field; or a
client-asserted `authorized`, `consentVerified`, `wardrobeSnapshotFresh`,
`ownerAccountId`, `ranking`, or `recommendation` value — makes the envelope
fail the single closed-key check and the whole request fails closed with
`closed-minimized-request-envelope-required`. There is no separate allow-one
exception for any of these; closing the key set is the entire enforcement
mechanism, so it cannot be bypassed field-by-field.

The request itself must carry the exact supported version; missing, older, or
unknown versions fail closed. Request IDs and private-record references are
bounded opaque identifiers rather than URLs, JSON, or free text. The accepted
plan is byte-stable: `serializeDailyStylistProductionPlan` (stable-key JSON,
reused from `scripts/ai-stylist-evaluator.mjs`) produces the same string for
the same accepted request every time.

## Required server-side resolution order

A future authenticated server must resolve an accepted envelope in this exact
order and stop at the first failing step with the named reason code. This
contract documents the order and reason codes only — it never authenticates a
session, authorizes ownership, checks real consent, resolves a real profile or
snapshot, derives real candidates, or calls the delegated contracts. No
record is resolved and no step is executed by this repository.

| # | Step | Stop reason code |
| --- | --- | --- |
| 1 | Authenticate session | `session-not-authenticated` |
| 2 | Authorize same-account ownership | `cross-account-access-denied` |
| 3 | Verify active personalization consent | `personalization-consent-revoked-or-missing` |
| 4 | Resolve the profile reference | `profile-reference-unresolved` |
| 5 | Verify the wardrobe snapshot is current | `wardrobe-snapshot-stale-or-unresolved` |
| 6 | Derive minimized outfit candidates | `insufficient-minimized-candidates` |
| 7 | Delegate to Daily Outfit Intent | `daily-outfit-intent-not-ready` |
| 8 | Adapt the accepted Grounded Stylist response | `grounded-stylist-response-not-ready` |

Steps 7 and 8 delegate unchanged to `evaluateDailyOutfitIntent`
(`scripts/daily-outfit-intent-contract.mjs`) and
`adaptDailyOutfitStylistResponse` (`scripts/grounded-daily-outfit-stylist.mjs`).
This boundary does not recreate context validation, candidate ranking, ties,
uncertainty, abstention, or response wording — those remain owned entirely by
the two accepted contracts it cites by version
(`delegatesTo.dailyOutfitIntentVersion`,
`delegatesTo.groundedDailyOutfitStylistVersion`).

## Consent, freshness, correction, export, and deletion

- Consent is the same purpose-specific `personalization` grant defined in
  `docs/PRIVATE_PROFILE_SERVICE_V1.md`. Revocation is timestamped and takes
  effect before the next request resolves — a request that arrives after
  revocation stops at step 3, not later.
- A wardrobe snapshot older than the existing 30-day fixture limit
  (`WARDROBE_SNAPSHOT_MAX_AGE_DAYS` in
  `scripts/private-profile-service-contract.mjs`) stops at step 5 rather than
  silently resolving stale evidence.
- Corrections, exports, and deletions are unchanged by this boundary — they
  remain the private profile service's responsibility. A profile or wardrobe
  reference that belongs to a `deleting` or `deleted` account cannot resolve
  at step 2 or step 4.

## Extension caching limits

A future browser or extension client may cache only:

- the request envelope's own stable references and explicit context fields;
- the currently active minimized Grounded Stylist response for that exact
  request.

It may not cache the full wardrobe, profile, Style DNA, Fit DNA,
measurements, photos, consent state, or any other client's data. This mirrors
the existing extension data-minimization rule in
`docs/PERSONALIZATION_API_V1.md`.

## Public product truth vs. private personalization data

Product identity, price, availability, and affiliate offers remain owned by
the public product/offer graph and are never part of this request or its
resolution plan. Only step 6's minimized outfit candidates connect the two —
and that step still resolves nothing here; it only names the fail-closed
reason a real server must use when too few trustworthy candidates exist.

## Fixture evidence

`scripts/daily-stylist-production-boundary-contract.mjs` provides:

- the closed, versioned, byte-stable request envelope validator;
- the fixed, ordered `RESOLUTION_STEPS` plan with one stop reason per step;
- version citations into the accepted Daily Outfit Intent and Grounded Daily
  Outfit Stylist contracts.

`scripts/__tests__/daily-stylist-production-boundary-contract.test.mjs`
covers the accepted envelope, both desired-outfit counts, byte stability,
unknown fields, embedded raw/private payloads, live-context fields,
client-asserted authorization/consent/freshness/ownership/ranking/outcome
fields, credential and commerce/action fields, and the fixed resolution-step
order with its reason codes.

The fixture contains no real account, session, profile, wardrobe, consent
record, network request, database, or deployed endpoint.

## Production gates

No route, endpoint, provider, database, account, session, real user record,
collection flow, network call, or production access is authorized by this
contract. Building the authenticated server that actually executes this plan
is a separate, later implementation boundary.

## Next implementation boundary

After this contract is reviewed:

1. specify how a future authenticated server executes each resolution step
   against the real private profile/wardrobe service and the real Daily
   Outfit Intent / Grounded Stylist contracts;
2. choose the production authentication and session architecture;
3. complete privacy/legal review before any real profile or wardrobe data is
   processed;
4. expose the same contract to signed-in web clients before extension or
   mobile clients;
5. begin a Chrome-extension proof only after browser permissions are
   separately approved.
