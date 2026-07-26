# Fixture authenticated Daily Stylist service seam v1

Status: fixture-only, deterministic, provider-neutral, and built only by
composing already-accepted contracts. No route, endpoint, account, session,
database, provider, or real private record exists.

## Purpose

Issue #159 (`docs/DAILY_STYLIST_PRODUCTION_BOUNDARY_V1.md`) specified the
exact eight-step order a future authenticated server must resolve an accepted
request in, and the exact fail-closed reason code for each step. It did not
prove that order actually executes correctly, stops at the first untrusted
step, and still leaves ranking, ties, uncertainty, and abstention entirely
owned by the already-accepted Daily Outfit Intent and Grounded Daily Outfit
Stylist contracts. This seam is that proof: one deterministic module,
`scripts/daily-stylist-service-seam.mjs`, that composes closed synthetic
fixture adapters end to end instead of a real server.

## Adapter responsibilities and data ownership

`runDailyStylistServiceSeam({ session, requestEnvelope, privateService,
nowIso })` composes exactly these adapters, in this order, and never
re-derives any of their policy:

| Step | Adapter | Data it owns |
| --- | --- | --- |
| Envelope validation | `planDailyStylistProductionRequest` (`scripts/daily-stylist-production-boundary-contract.mjs`) | The closed request-envelope schema and the `RESOLUTION_STEPS` plan |
| 1. Authenticate session | `validatePrivateSession` (`scripts/private-access-security-policy.mjs`) | Session shape, lifetime, expiry, CSRF |
| 2. Authorize request | `authorizePrivateAction` (`scripts/private-access-security-policy.mjs`) | Same-account ownership and required personalization scope |
| 2–5. Ownership, consent, profile, snapshot | `getPersonalizationReferences` (`scripts/private-profile-service-contract.mjs`) | Account/profile/wardrobe-snapshot/consent records |
| 6. Derive candidates | this seam (new, synthetic-only) | The authorized wardrobe snapshot reference plus a closed fixture evidence mode |
| 7. Delegate intent | `evaluateDailyOutfitIntent` (`scripts/daily-outfit-intent-contract.mjs`) | Context validation, ranking, ties, uncertainty, abstention |
| 8. Adapt response | `adaptDailyOutfitStylistResponse` (`scripts/grounded-daily-outfit-stylist.mjs`) | Response wording, citations, minimized outfit evidence |

No step's policy is copied into the seam. The seam only sequences these
adapters and translates each one's own accepted/rejected result into a
`{ step, outcome, reasonCode }` trace entry.

## Failure propagation

The seam executes `RESOLUTION_STEPS` in the fixed order defined by issue
#159 and stops at the first failing step with that step's exact
`failReasonCode`. Steps 2–5 are resolved by a single call to
`getPersonalizationReferences`, which already enforces this same internal
order (ownership, then consent, then profile/snapshot existence, then
staleness). The seam maps that call's one returned error code back onto the
step it corresponds to:

| `getPersonalizationReferences` error | Attributed step | Reason code |
| --- | --- | --- |
| `access-denied` | `authorize-same-account-ownership` | `cross-account-access-denied` |
| `personalization-consent-required` | `verify-active-personalization-consent` | `personalization-consent-revoked-or-missing` |
| `private-context-not-found` | `resolve-profile-reference` | `profile-reference-unresolved` |
| `stale-wardrobe-snapshot` | `verify-wardrobe-snapshot-current` | `wardrobe-snapshot-stale-or-unresolved` |

Because that internal order is fixed, the seam also back-fills a `passed`
trace entry for every earlier step in `authorize-same-account-ownership` →
`verify-active-personalization-consent` → `resolve-profile-reference` →
`verify-wardrobe-snapshot-current` that the failure implies must already have
succeeded — for example, an unresolved-profile failure always trace-confirms
that ownership and consent passed first. No later step (candidate derivation,
Daily Outfit Intent, Grounded Stylist adaptation) ever runs once any step
fails; a stopped result always carries `response: null`.

Steps 7 and 8 delegate unchanged. `evaluateDailyOutfitIntent` only returns
`ok: false` for a structurally invalid call (which the seam's own validated
context and derived candidates cannot produce), never for a `review-required`
or `abstained` business outcome — those remain `ok: true` results that the
seam forwards untouched, so ready, review-required, tie, insufficiency, and
abstention outcomes are always decided by the intent/adapter contracts, never
by this seam.

## Revocation timing

Consent is the same purpose-specific `personalization` grant defined in
`docs/PRIVATE_PROFILE_SERVICE_V1.md`. Revocation is timestamped and takes
effect immediately for the next call: a fixture service instance whose
consent was revoked before `runDailyStylistServiceSeam` runs stops at step 3
(`verify-active-personalization-consent`) with no candidate derivation,
intent delegation, or response adaptation ever executing.

## Stale-snapshot behavior

A wardrobe snapshot older than the existing 30-day fixture limit
(`WARDROBE_SNAPSHOT_MAX_AGE_DAYS` in
`scripts/private-profile-service-contract.mjs`) stops at step 5
(`verify-wardrobe-snapshot-current`) rather than deriving candidates from
stale evidence. Freshness is evaluated against the `nowIso` the seam call
receives, exactly as `getPersonalizationReferences` already does.

## Minimized candidate derivation

Step 6 is deliberately a closed fixture adapter, not a wardrobe recommendation
algorithm. It accepts only the already-authorized wardrobe snapshot reference
plus one internal synthetic evidence mode (`ready`, `tie`, or `insufficient`).
It never reads the snapshot's item contents, item count, identity, brand,
size, or fit evidence. The closed modes produce deterministic synthetic
four-item capsules (`top`/`bottom`/`footwear`/`outerwear`) solely to prove
success, tie preservation, and first-failure stopping through the accepted
contracts. An unsupported mode fails before service execution.

Real candidate derivation remains a separate production gate: it must operate
inside the authorized private service boundary, use minimized evidence, and
must not infer outfit usefulness from wardrobe size alone.

## Client trust boundaries

Nothing changes about who may assert what. A client still supplies only the
closed `daily-stylist-production-boundary-v1` envelope (issue #159); it never
asserts authorization, consent, snapshot freshness, ownership, ranking, or a
recommendation outcome. The seam's own output is equally closed: the
minimized result contains only `{ ok, schemaVersion, requestId, outcome,
stoppedAtStep, reasonCode, trace, response }`, where `trace` entries contain
only `{ step, outcome, reasonCode }` and `response` is the unmodified
accepted Grounded Stylist response or `null`. The session, raw profile,
wardrobe payload, consent record, Style DNA, Fit DNA, sizes, measurements,
photos, notes, and adapter internals never appear in that result — this is
verified directly in
`scripts/__tests__/daily-stylist-service-seam.test.mjs` by scanning the
serialized result for the fixture's actual private values and by pinning the
top-level and response key sets.

## Byte stability

`serializeDailyStylistServiceSeamResult` (stable-key JSON, reused from
`scripts/ai-stylist-evaluator.mjs`) produces the same string for the same
accepted fixture input every time, for both completed and stopped outcomes.

## Fixture evidence

`scripts/daily-stylist-service-seam.mjs` provides `runDailyStylistServiceSeam`
and `serializeDailyStylistServiceSeamResult`.
`scripts/__tests__/daily-stylist-service-seam.test.mjs` covers: an accepted
request executing every step in order; the invalid-request short-circuit; a
missing and an expired session; cross-account and missing-scope denial;
consent revocation; unresolved profile and snapshot references; a stale
snapshot; insufficient closed fixture evidence; proof that candidate
derivation ignores wardrobe contents and count; review-required and abstention context
outcomes passed through unmodified; an exact ranking tie preserved, not
broken; byte stability for both completed and stopped outcomes; and the
minimized-output privacy, shape, and commercial/external-action exclusions.
Every failing scenario also asserts the exact trace contents, proving no
downstream step ever executed after the first failure.

The fixture contains no real account, session, profile, wardrobe, consent
record, network request, database, or deployed endpoint.

## Production gates

No route, endpoint, provider, database, account, session, real user record,
collection flow, network call, Chrome permission, personalized image,
commerce action, or external action is authorized by this seam.

## Later production gates

After this seam is reviewed:

1. specify how a future authenticated server executes each resolution step
   against the real private profile/wardrobe service instead of the fixture
   one, keeping the same order and reason codes;
2. choose the production authentication and session architecture;
3. complete privacy/legal review before any real profile or wardrobe data is
   processed;
4. build a reviewable fixture journey for this seam's success and every
   trust-failure path, behind a default-off, unlinked route, before any of
   the above;
5. expose the same contract to signed-in web clients before extension or
   mobile clients;
6. begin a Chrome-extension proof only after browser permissions are
   separately approved.
