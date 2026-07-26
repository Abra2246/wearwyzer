# Private profile and wardrobe service v1

## Purpose

Define the provider-agnostic private data boundary behind WearWyzer accounts,
Style DNA, Fit DNA, digital wardrobes, consent, corrections, exports,
deletions, and sensitive-access audit events.

This is a fixture-only contract. It does not select an authentication or
database vendor, deploy infrastructure, or authorize real personal data.

## Ownership model

| Fact | Canonical owner | Client access |
| --- | --- | --- |
| Account identity and status | Authenticated account service | Own account reference only |
| Profile and Style DNA signals | Private profile service | Own editable records and derived explanations |
| Sizes, fit preferences, observations | Private fit service boundary | Own records; guidance is never a guarantee |
| Wardrobe inventory and snapshots | Private wardrobe service | Own inventory; extension receives references/results only |
| Consent and revocation | Private consent service boundary | Own purpose-specific grants |
| Product identity, price, stock, offers | Public product/offer graph | Verified active facts |
| Recommendation scores | Versioned personalization service | Active decision only |
| Operational health | Mission Control | Aggregates only; no private payloads |

## Authorization invariants

- Every private record carries an owning `accountId`.
- A user actor may read or mutate only records with the same account ID.
- A deleted or deleting account cannot begin a new personalized read.
- Cross-account reads and writes fail closed and emit a minimized denied audit
  event.
- Browser, mobile, and extension clients never become canonical stores.
- Future service-to-service access must be separately scoped and audited.

## Consent model

Consent is purpose-specific:

- personalization;
- style learning;
- fit guidance;
- wardrobe photos;
- personalized images.

One grant never implies another. Revocation is timestamped and takes effect
before the next dependent operation. Personalized images remain a separate
later approval even when general personalization is enabled.

## User overrides and provenance

Style and fit signals are either `explicit` or `inferred`. Explicit user
choices outrank inferred behavior. Corrections are append-only evidence and
update the active derived record without erasing why the correction occurred.

Every signal records provenance, confidence, and update time. Low-confidence
inference must not masquerade as a user preference.

## Wardrobe snapshots

Personalization requests use stable snapshot references. A snapshot includes
only the owner's wardrobe items at a point in time and records canonical
product match state and confidence. Unknown personal items remain valid.

The fixture boundary rejects snapshots older than 30 days. Production
freshness may later become event-driven, but stale snapshots must always be
visible rather than silently used.

## Export and deletion

Exports are versioned machine-readable bundles containing the account's
profile, fit, wardrobe, consent, and correction records. Security audit
telemetry is not copied into the client export.

Deletion has explicit `pending`, `completed`, and `failed` states. Completion
removes dependent private records and leaves only a minimized account
tombstone and audit evidence needed to prove completion. Failure must include
an actionable code and cannot be reported as completed.

## Audit minimization

Audit events contain identifiers, action, target type, outcome, and timestamp.
They never contain:

- access tokens or credentials;
- full profiles or wardrobes;
- measurements or photos;
- raw Style DNA or Fit DNA values;
- browser history;
- recommendation prompts or generated likenesses.

## Provider comparison rubric

A later founder decision should compare providers on:

1. row- or record-level authorization guarantees;
2. regional hosting and deletion support;
3. encrypted storage and secret management;
4. auditability and export portability;
5. mobile, web, and extension session support;
6. migration and vendor-lock-in risk;
7. cost at prototype and growth stages;
8. operational complexity and recovery tooling.

No vendor is selected by this document.

## Fixture evidence

`scripts/private-profile-service-contract.mjs` provides:

- closed record validators;
- same-account authorization;
- purpose-specific personalization consent;
- stale wardrobe rejection;
- explicit correction precedence;
- versioned export;
- stateful deletion;
- minimized audit events.

The fixture contains no real person, network request, database, secret, camera
input, paid call, or deployed endpoint.

## Fixture consent and correction center

`scripts/consent-correction-store.mjs` composes `createFixturePrivateService`
(read-only/versioned, unmodified) with Web Storage persistence for
`consent-correction-center.dc.html` — a default-off, noindex, unlinked
route (Issue #87). It adds purpose-specific consent gating for corrections,
an inferred Fit DNA correction path the base contract's generic
`applyProfileCorrection` does not implement, and a deterministic reset. No
production account, database, real personal data, or browser permission is
created.

## Next implementation boundary

After review:

1. choose the production auth/storage architecture with legal/privacy input;
2. review the provider-agnostic threat model in
   `docs/PRIVATE_DATA_THREAT_MODEL_V1.md`;
3. implement local or ephemeral end-to-end account flows before real users;
4. add secure server-side resolution for the merged personalization API;
5. approve Chrome permissions separately before any extension proof.
