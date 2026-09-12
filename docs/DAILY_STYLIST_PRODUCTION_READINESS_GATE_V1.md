# Daily Stylist production-readiness gate v1

Status: fixture-only, deterministic, provider-neutral. No vendor is
selected, no real data is processed, and no deployment is authorized by
this contract.

## Purpose

Issue #168 (`docs/DAILY_STYLIST_WEB_TRANSPORT_BOUNDARY_V1.md`) recorded ten
production decisions as unresolved — authentication/session provider,
session/cookie architecture, hosting, storage, retention, privacy/legal
review, monitoring, rate limiting, abuse prevention, and incident response —
and deliberately left every one of them open rather than choosing
implicitly. That list was prose: nothing checked whether a decision had
actually been closed, who was allowed to close it, or whether the evidence
for it was still current.

This contract turns that list into one closed, deterministic readiness
gate: `scripts/daily-stylist-production-readiness-gate-contract.mjs`
(`evaluateDailyStylistProductionReadiness`). It accepts only minimized
decision evidence for the same ten areas and produces one minimized
decision packet — never a vendor comparison, never real data, never a
deployment authorization. `evaluateCurrentDailyStylistProductionReadiness`
runs the gate against the actual, current state of all ten decisions
(`CURRENT_DAILY_STYLIST_PRODUCTION_DECISIONS`: all ten still `missing`) and
is the closed-loop proof that the objective is met today: it evaluates to
`not-ready`.

## The ten decision areas (closed, exhaustive, each required exactly once)

| Decision area | Required approval class | Why |
| --- | --- | --- |
| `auth-session-provider` | `founder` | Selects an external auth/session vendor or protocol; carries credential and spend commitment |
| `session-cookie-architecture` | `engineering` | Internal technical design (cookie flags, lifetime, rotation) — no vendor or spend choice |
| `hosting` | `founder` | Selects an external hosting vendor, runtime, and region; carries spend commitment |
| `storage` | `founder` | Selects an external database/storage vendor and migration path; carries spend commitment |
| `retention` | `privacy-legal` | Defines how long real personal records are kept — a data-handling policy, not an engineering call |
| `privacy-legal-review` | `privacy-legal` | The privacy/legal review itself |
| `monitoring` | `founder` | Selects an external logging/tracing/alerting vendor; carries spend commitment |
| `rate-limiting` | `engineering` | Internal per-account/per-IP policy — no vendor or spend choice of its own |
| `abuse-prevention` | `founder` | Typically selects an external fraud/anomaly-detection vendor; carries spend commitment |
| `incident-response` | `engineering` | Internal on-call/escalation process — the same-named breach-notification legal obligation is covered by `privacy-legal-review`, not duplicated here |

The required approval class for each area is fixed in code
(`REQUIRED_APPROVAL_CLASS`) and is never read from submitted evidence, so it
cannot be widened, narrowed, or inferred by an input record. Engineering
evidence alone can never satisfy a `founder`- or `privacy-legal`-required
decision — an approval from the wrong class is evaluated as
`wrong-approver-class`, not as a lesser but acceptable substitute.

## Decision record (`daily-stylist-production-readiness-gate-v1`)

Exactly one record per area, no more, no fewer, and each record has exactly
these six closed fields:

| Field | Type | Constraint |
| --- | --- | --- |
| `decisionArea` | string | one of the ten closed area keys above |
| `status` | string | one of `missing`, `proposed`, `rejected`, `expired`, `approved` |
| `evidenceRef` | string or null | `null` iff `status === 'missing'`; otherwise a bounded opaque identifier (`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`) — never a URL, document body, or free text |
| `approverClass` | string or null | `null` unless `status === 'approved'`; otherwise one of `engineering`, `founder`, `privacy-legal` |
| `approvedAtIso` | ISO string or null | `null` unless `status === 'approved'`; otherwise an ISO timestamp |
| `evidenceAtIso` | ISO string or null | `null` iff `status === 'missing'`; otherwise an ISO timestamp |

Any unrecognized top-level field, unrecognized field on a record, an
unsupported `decisionArea` or `status` or `approverClass` value, a
duplicated `decisionArea`, an envelope without exactly ten records, an
unbounded/over-broad `evidenceRef` (a URL, free text, or anything else that
could carry raw legal text, a contract term, a secret, personal data, a
commercial rate, session material, or private document content), or any
status/evidence/approval combination that contradicts itself (for example
an `approved` status without an `approverClass`, or a non-`missing` status
without an `evidenceRef`) fails the whole envelope as one closed check
(`closed-readiness-gate-envelope-required`, or `duplicate-decision-area`
for a repeated area) before any decision is evaluated.

Evidence older than `EVIDENCE_MAX_AGE_DAYS` (180 days), even when cleanly
approved by the correct class, is evaluated as stale and never contributes
to `ready-for-implementation-review`.

## Aggregate status

The gate produces exactly one of three closed statuses:

| Status | Meaning |
| --- | --- |
| `not-ready` | At least one `founder`- or `privacy-legal`-required decision is not cleanly approved (missing, proposed, rejected, expired, wrong approver class, or stale) |
| `review-required` | Every `founder`- and `privacy-legal`-required decision is cleanly approved, but at least one `engineering`-required decision is not |
| `ready-for-implementation-review` | Every one of the ten decisions is cleanly approved by its required class with fresh evidence |

`ready-for-implementation-review` means only that a future implementation
design may be reviewed. It never authorizes an endpoint, account, database,
migration, credential, real private record, deployment, or external
action — this is a fixed, always-present field on every result
(`authorizationScope`, `READINESS_GATE_AUTHORIZATION_SCOPE`), not a claim
made only in this document.

## Output (per decision)

Each decision in the output packet carries only: `decisionArea`, `status`
(echoed from the input), `approvalClass` (the fixed required class, never
the submitted `approverClass`), `evidenceRef` (the bounded reference,
echoed), `freshness` (`fresh`, `stale`, or `not-applicable`), `blockers`
(a list of closed reason codes), and `nextStep`. Nothing else. The
submitted `approverClass` — who actually signed off — is deliberately not
echoed back; a `wrong-approver-class` blocker communicates that the wrong
class signed without naming which one.

Identical input serializes byte-stably
(`serializeDailyStylistProductionReadinessPacket`), and decisions are
always re-sorted into the canonical ten-area order regardless of the
order they were submitted in, so equivalent submissions in a different
order still produce identical output.

## Production gates

No vendor is selected, no provider comparison is made, no legal advice is
given, no production endpoint, middleware, authentication, account, cookie,
database, storage, migration, monitoring service, rate limiter, abuse
service, or incident-response tooling is created, and no real user data,
credential, network call, paid API, Chrome permission, personalized image,
commerce action, purchase, publication, message, or other external action
occurs. This contract only evaluates evidence that a human has already
recorded elsewhere; it never records evidence itself and never substitutes
for actual founder or privacy/legal approval.

## Next steps after this contract is reviewed

1. A human closes each of the ten decisions in writing, through whatever
   process the founder and privacy/legal owners choose — this contract does
   not define or constrain that process, only how its outcome is evaluated.
2. Re-run `evaluateDailyStylistProductionReadiness` (or
   `evaluateCurrentDailyStylistProductionReadiness` once the real decision
   evidence replaces `CURRENT_DAILY_STYLIST_PRODUCTION_DECISIONS`) against
   the recorded evidence.
3. Only once the result is `ready-for-implementation-review` does a future
   implementation design become eligible for review — and even then, that
   review is a separate, later slice, not authorized by this contract.
4. The route/journey that lets a human review this packet in a browser
   (mirroring the Issue #165/#171 fixture-journey pattern) is a separate
   follow-up; no UI or route exists in this slice.
