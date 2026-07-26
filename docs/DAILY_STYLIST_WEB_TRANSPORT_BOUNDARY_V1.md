# Signed-in web transport boundary for Daily Stylist v1

Status: fixture-only, deterministic, provider-neutral, and built only by
composing already-accepted contracts. No route, endpoint, account, session,
cookie, database, provider, or real private record exists.

## Purpose

Issue #159 (`docs/DAILY_STYLIST_PRODUCTION_BOUNDARY_V1.md`) specified the
closed request envelope and the exact eight-step server-side resolution
order a future authenticated server must follow. Issue #162
(`docs/DAILY_STYLIST_SERVICE_SEAM_V1.md`) proved that order executes
correctly against fixture adapters. Neither defined how a signed-in **web**
client actually reaches that seam: what a trusted web server may pass in
from its own middleware (method, media type, origin, CSRF, request-ID
evidence) versus what must remain entirely inside the seam (session
authentication, ownership, consent, reference resolution, freshness,
ranking, ties, uncertainty, abstention), or what a browser is allowed to see
back. This contract closes that gap with one deterministic transport-boundary
module. It does not create a route, endpoint, authentication provider,
account, database, session cookie, or private record.

## Trust ownership

| Layer | Owns | Never sees / never asserts |
| --- | --- | --- |
| Browser | Presenting the closed `daily-stylist-production-boundary-v1` envelope (issue #159) and rendering the closed client response | Session tokens, credentials, any other account's data, private-service internals |
| Trusted web middleware | Resolving method, media type, same-origin result, CSRF result, and request-ID/idempotency evidence into one closed transport context; resolving the caller's session into an opaque server-side reference | Personalization business logic, ranking, ties, abstention |
| This transport boundary (`scripts/daily-stylist-web-transport-boundary.mjs`) | Rejecting a closed, fixed set of transport-level and envelope-level defects before the service seam runs; renaming the seam's own outcome into one closed client response | Authentication, ownership, consent, reference resolution, freshness, ranking, ties, uncertainty, abstention — all delegated unchanged |
| Service seam (`scripts/daily-stylist-service-seam.mjs`, issue #162) | The full eight-step `RESOLUTION_STEPS` order | Transport concerns (method, media type, origin, CSRF) |
| Private service (`scripts/private-profile-service-contract.mjs`) | Real profile/wardrobe/consent records | Anything transport- or presentation-related |

The browser never asserts authorization, consent, snapshot freshness,
ownership, ranking, or an outcome — the envelope has no field for any of
those facts (issue #159), and this boundary adds no new field that would let
one in.

## Transport context (`daily-stylist-web-transport-context-v1`)

A future trusted web server resolves exactly these five trusted middleware
outcomes plus its own request-ID evidence into a closed object before this
boundary runs. It is never provided by the browser directly.

| Field | Type | Constraint |
| --- | --- | --- |
| `schemaVersion` | string | exactly `daily-stylist-web-transport-context-v1` |
| `method` | string | exactly `POST` |
| `mediaType` | string | exactly `application/json` |
| `sameOriginVerified` | boolean | exactly `true` |
| `csrfVerified` | boolean | exactly `true` |
| `requestId` | string | bounded opaque identifier; must equal the accepted request body's `requestId` |

Any unrecognized key, wrong `schemaVersion`, non-`POST` method, non-JSON
media type, a same-origin or CSRF result that is not explicitly `true`, or a
`requestId` that does not match the request body's own `requestId` fails the
whole transport context as one closed check
(`closed-web-transport-context-required`) and the service seam never runs.
The `requestId` match is the idempotency evidence this boundary can verify
deterministically; it does not implement a replay cache or any other
persistence.

## Accepted request body

Unchanged from issue #159: the closed `daily-stylist-production-boundary-v1`
envelope, validated by reusing `planDailyStylistProductionRequest`
(`scripts/daily-stylist-production-boundary-contract.mjs`) directly rather
than re-implementing envelope validation. An unsupported schema version, an
unknown field, a credential, an embedded raw profile/wardrobe/Style DNA/Fit
DNA/size/measurement/photo/note payload, a live-context field (exact
location, weather-provider payload, calendar, itinerary, browsing history),
a commercial/affiliate/purchase/notification/publishing field, or a
client-asserted authorization/consent/freshness/ownership/ranking/outcome
field all fail the same closed envelope check and stop before the service
seam runs — none of these categories requires a separate check in this
boundary; the reused, already-accepted envelope validator already closes all
of them.

## Session handling

This boundary never authenticates a session itself. It accepts only an
opaque, server-resolved session reference or fixture session object through
a separate `session` argument — never embedded in the request body, and
never serialized into the client response. That value is forwarded
unchanged to `runDailyStylistServiceSeam`, which owns session authentication,
same-account ownership, and consent verification exactly as issue #162
already proved.

## Delegation

Once the transport context and request body both pass their closed checks,
this boundary calls `runDailyStylistServiceSeam` (issue #162) unchanged with
the accepted request body, session, and private service. It does not
re-implement, shortcut, or duplicate any of that seam's eight resolution
steps.

## Client response (`daily-stylist-web-transport-response-v1`)

The seam's own result is adapted into exactly one closed shape:
`{ schemaVersion, requestId, status, nextStep, response }`. `response` is
the unmodified accepted Grounded Stylist response for a completed outcome,
or `null`. Nothing else — no step trace, no session, no raw profile/
wardrobe/consent data, no adapter internals, no provider error — ever
appears in it. A rejected request may echo only the bounded request ID
resolved by trusted middleware; the browser-provided request body is never
used as a reflection source.

| Client `status` | Meaning | Source |
| --- | --- | --- |
| `ready` | A trusted answer is available | Seam outcome `completed`, response outcome `answer` |
| `review-required` | Context or a selection tie needs review | Seam outcome `completed`, response outcome `review-required` |
| `abstained` | WearWyzer would not guess from conflicting evidence | Seam outcome `completed`, response outcome `abstain` |
| `unauthenticated` | The session did not authenticate | Seam step `authenticate-session` |
| `unauthorized` | Cross-account access or a missing required scope | Seam step `authorize-same-account-ownership` |
| `consent-required` | Personalization consent is revoked or missing | Seam step `verify-active-personalization-consent` |
| `unresolved-context` | The profile reference did not resolve | Seam step `resolve-profile-reference` |
| `stale-snapshot` | The wardrobe snapshot is unresolved or older than the fixture freshness limit | Seam step `verify-wardrobe-snapshot-current` |
| `insufficient-candidates` | The minimized evidence did not support enough trustworthy candidates; the client reviews the available wardrobe evidence rather than inferring that the user should buy or add more clothing | Seam step `derive-minimized-outfit-candidates` |
| `service-unavailable` | An internal delegation invariant did not hold | Seam steps `delegate-daily-outfit-intent`/`adapt-grounded-stylist-response`, or an unsupported internal fixture mode |
| `request-rejected` | The transport context or request body failed its closed check | Before the service seam runs |

This mapping only renames each seam outcome; it never re-derives *why* a
step failed. `unauthorized` intentionally covers both cross-account access
and a missing required scope because the seam itself already resolves both
at the same `authorize-same-account-ownership` step (issue #162) — this
boundary does not split them apart, which would require re-deriving
authorization detail it does not own.

## No existence oracle

Because the client status is a direct rename of the seam's own step
attribution, and the seam itself already collapses "reference does not
exist" and "reference belongs to another account, resolved through a
snapshot reference the caller does own" into the same step where issue #162
already decided that collapse belongs, this boundary introduces no new way
to distinguish those cases. Two different unresolved profile references
produce byte-identical client responses, and no stopped-category response
ever carries the profile, snapshot, or account reference that was checked.

## Fixture evidence

`scripts/daily-stylist-web-transport-boundary.mjs` provides
`runDailyStylistWebTransportBoundary`, `validateWebTransportContext`, and
`serializeDailyStylistWebTransportResponse`.
`scripts/__tests__/daily-stylist-web-transport-boundary.test.mjs` covers:
every transport-context rejection (non-POST, non-JSON, unverified
same-origin, failed CSRF, a mismatched request ID, an unsupported context
version, an unknown context field); every representative envelope-level
rejection (unsupported version, unknown field, credential, embedded private
payload, live-context field, commercial field, external-action field, and
client-asserted authorization/consent/ranking fields); proof that a
poisoned private-service stand-in that throws on any access is never touched
after any pre-seam rejection; proof that an invalid browser-provided request
ID is not reflected and a rejected mismatch echoes only the bounded trusted
middleware ID; every completed outcome (ready,
review-required from unknown context, abstained from a conflicting context,
review-required from an exact tie); every stopped client status
(unauthenticated, unauthorized for both cross-account and missing-scope,
consent-required, unresolved-context, stale-snapshot for both an unresolved
and a genuinely stale snapshot, insufficient-candidates); the closed
five-key response shape with no trace/session/reason-code leakage; byte
stability for both completed and stopped outcomes; byte-identical responses
for two different unresolved profile references (no existence oracle); and
the absence of any commercial, credential, or external-action field.

The fixture contains no real account, session, profile, wardrobe, consent
record, network request, database, cookie, or deployed endpoint.

## Production decision packet

This contract intentionally leaves every one of these choices open. None is
selected implicitly by this fixture, and none may be inferred from it:

| Decision area | Status |
| --- | --- |
| Authentication/session provider | Unresolved — no vendor, protocol, or in-house implementation chosen |
| Session/cookie architecture | Unresolved — cookie name, flags (`HttpOnly`/`Secure`/`SameSite`), lifetime, and rotation policy undecided |
| Hosting | Unresolved — no server, runtime, or region chosen |
| Storage | Unresolved — no database, ORM, or migration path chosen for real profile/wardrobe/consent records |
| Retention | Unresolved — no data-retention or backup-expiry policy defined for real records |
| Privacy/legal | Unresolved — requires legal review before any real profile or wardrobe data is processed (`docs/DAILY_STYLIST_PRODUCTION_BOUNDARY_V1.md`, consent section) |
| Monitoring | Unresolved — no logging, tracing, or alerting destination chosen |
| Rate limiting | Unresolved — no per-account or per-IP request-rate policy defined |
| Abuse prevention | Unresolved — no bot/fraud/anomaly-detection strategy defined |
| Incident response | Unresolved — no on-call, escalation, or breach-notification process defined |

A future implementation boundary must choose each of these explicitly and in
writing before any real endpoint, session, or private record is created.

## Fixture review journey

The unlinked, `noindex` route
`daily-stylist-web-transport-fixture.dc.html?ww_daily_stylist_web_transport=1`
(`scripts/daily-stylist-web-transport-fixture-journey.mjs`,
`createDailyStylistWebTransportFixtureJourney`) makes this boundary's closed
client responses reviewable without adding a second policy layer. It covers
all twenty closed scenarios:

- ready;
- review-required from an unknown context;
- abstained from a conflicting context;
- an exact selection-boundary tie;
- a non-`POST` method, a non-JSON media type, an unverified same-origin
  result, and a failed CSRF result (all rejected before the service seam
  runs);
- a request-ID mismatch and an invalid browser-supplied request ID (both
  rejected before the service seam runs);
- missing and expired sessions;
- a missing personalization scope and cross-account access;
- revoked consent;
- an unresolved profile reference;
- an unresolved and a stale wardrobe snapshot;
- insufficient fixture candidates; and
- an unsupported internal fixture mode.

Each scenario supplies its own synthetic transport-context/request-body/
session/private-service fixture input directly to
`runDailyStylistWebTransportBoundary` — the journey never re-derives any
composed contract's policy. The page renders only the boundary's own closed
client response (`status`, `requestId`, `nextStep`, and — for a completed
outcome — the unmodified Grounded Stylist response) plus a fixed,
non-sensitive transport-check summary derived from the scenario's own
transport-context input. It never renders the seam's step trace, a session,
raw private data, an internal reason code, provider details, or a
browser-supplied rejected request ID; a rejected mismatch echoes only the
trusted middleware request ID. Changing the scenario clears the previous
result, and reset restores the `ready` default and keyboard focus.

Without the exact query flag the fixture controls remain hidden. The route
is not linked from any other site page or `sitemap.xml`, and contains no
network/provider call, live/private input, persistence, analytics,
commerce, or external action.

## Production gates

No route, endpoint, provider, database, account, session, cookie, real user
record, collection flow, network call, Chrome permission, personalized
image, commerce action, or external action is authorized by this boundary.

## Next implementation boundary

After this contract and its review journey are reviewed:

1. choose the production authentication and session/cookie architecture from
   the decision packet above;
2. stand up the real trusted web middleware that resolves the transport
   context fields this boundary already validates;
3. complete privacy/legal review before any real profile or wardrobe data is
   processed;
4. implement the real authenticated server endpoint that calls this
   boundary against real sessions and the real private profile/wardrobe
   service, keeping the same closed request/response shapes;
5. expose the same contract to app or Chrome-extension clients only after
   their own transport and permission review.
