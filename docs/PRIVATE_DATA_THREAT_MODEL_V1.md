# Private data threat model v1

## Status and boundary

This is a provider-agnostic design review for future authenticated WearWyzer
accounts, wardrobes, recommendations, exports, deletions, photos, and Chrome
extension access.

It is not a penetration test, compliance certification, legal approval,
provider selection, or authorization to collect real personal data.

## Protected assets

- account identity and active sessions;
- profile, Style DNA, Fit DNA, sizes, measurements, and corrections;
- wardrobe inventory, photos, wear history, and snapshots;
- consent and revocation state;
- recommendation inputs and personalized outputs;
- exports, deletion state, backups, and audit evidence;
- product and offer integrity;
- service credentials and signing keys.

## Trust boundaries

```text
Shopping page (hostile by default)
        |
        v
Extension content script -- minimal message --> extension service worker
        |                                          |
        | no wardrobe                              | authenticated request
        v                                          v
WearWyzer UI ------------------------------> API gateway/session boundary
                                                   |
                     +-----------------------------+----------------------+
                     |                             |                      |
                     v                             v                      v
             Private profile/wardrobe      Recommendation service   Public product graph
                     |                             |
                     +--------- minimized refs ---+
```

The shopping page is never trusted. The extension is not a private-data store.
Mission Control receives aggregate status only.

## Security invariants

1. Every private record has one owning account.
2. Cross-account access fails closed before data resolution.
3. Sessions are short-lived, scoped, revocable, and audience-bound.
4. Web mutations require anti-CSRF evidence.
5. Extension messages are closed-schema, fresh, origin-checked, and minimal.
6. Product pages cannot send wardrobe, profile, measurement, token, or photo
   payloads through the extension boundary.
7. Purpose-specific consent is checked at use time, not only at collection.
8. Explicit user corrections outrank inferred signals.
9. Exports require a dedicated scope and step-up confirmation in production.
10. Deletion is not complete until records, private objects, provider sessions,
    backup expiry, and verification evidence are accounted for.
11. Logs and audit events contain identifiers and outcomes, never secrets or
    full private payloads.
12. The generative layer cannot directly read arbitrary private storage.

## Threat register

| Threat | Prevention | Detection | Recovery | Residual risk / owner |
| --- | --- | --- | --- | --- |
| Stolen or fixed session | Rotating short-lived sessions; secure cookies; audience binding | New-device and token-reuse telemetry | Revoke family; require re-authentication | Compromised device remains possible / Security |
| Cross-user object access | Owner ID enforced server-side; deny-by-default policy | Denied-access audit events and anomaly rate | Disable affected endpoint; verify access logs | Authorization bugs require independent testing / Engineering |
| Confused service role | Narrow service identities; no browser service key | Service/action mismatch alerts | Rotate role; revoke token; inspect affected records | Provider misconfiguration / Platform |
| CSRF on web mutation | Same-site cookies, anti-CSRF token, origin check | Failed token/origin telemetry | Revoke session; reverse unauthorized mutation where possible | Browser/plugin interference / Web |
| XSS extracts private data | Strict CSP, output encoding, no token in JS storage | CSP reports and client error telemetry | Revoke sessions; remove vulnerable release | Third-party script compromise / Web |
| Hostile shopping page spoofs extension | Isolated worlds; allowlisted HTTPS origins; signed/fresh messages | Rejected message counts by origin | Disable affected site adapter; update rules | Browser zero-day / Extension |
| Extension permission creep | Minimum host permissions; optional per-site grants | Manifest diff gate and store review | Remove permission; revoke release | User may grant broad access knowingly / Product |
| Extension storage leaks wardrobe | Cache active decision only; no full wardrobe/profile | Storage schema test and telemetry minimization review | Clear extension storage; revoke session | Local device compromise / Extension |
| Stale or revoked consent used | Check current consent on every sensitive operation | Consent-version mismatch events | Stop processing; delete derived data per policy | Distributed cache delay / Privacy |
| Export abuse | Dedicated scope, step-up auth, rate limit, encrypted delivery | Export volume/device anomaly | Revoke download; session reset | User email/device compromise / Security |
| Incomplete deletion | State machine and dependent-store checklist | Aging deletion SLA alert | Retry; escalate failed dependency | Immutable backups expire asynchronously / Privacy |
| Photo or measurement leakage | Separate encrypted object store and consent | Object-access audit and unusual-download alerts | Revoke URLs/keys; delete object; notify as required | Cloud/provider breach / Security |
| Sensitive logs | Closed audit schema and automated secret scan | CI/privacy tests and log sampling | Purge where possible; rotate exposed secret | External processor logs / Platform |
| Supply-chain compromise | Pinned dependencies/actions; provenance and review | Dependency alerts and integrity checks | Roll back; rotate secrets; isolate build | Trusted upstream compromise / Engineering |
| Product/offer poisoning | Canonical IDs, source freshness, match confidence | Drift, redirect, and mismatch checks | Quarantine source; use last known good | Source itself may be wrong / Commerce |
| Prompt/tool data exfiltration | Tool allowlists; minimized context; no raw storage query | Tool-call audit and output privacy checks | Disable tool/model path; revoke access | Novel model behavior / AI |
| Backup restoration revives deleted data | Deletion ledger applied after restore | Restore reconciliation job | Re-delete before reopening service | Recovery pressure or operator error / Platform |

## Surface requirements

### Website and portal

- HTTP-only, secure, same-site session cookies;
- no auth tokens in local storage;
- anti-CSRF and origin checks on mutations;
- re-authentication for export, deletion, and security changes;
- CSP without arbitrary third-party script execution.

### Mobile app

- platform secure storage for refresh material;
- certificate and server validation;
- remote session revocation;
- screenshots and device backups reviewed for sensitive screens/data.

### Chrome extension

- no broad browsing-history permission;
- site access requested only where product recognition operates;
- content scripts treat every page as hostile;
- service worker owns authenticated communication;
- active product ID and minimized evaluation may be cached briefly;
- full wardrobe, measurements, photos, tokens, and unrelated decisions are
  prohibited from extension storage and page messages.

### Services and AI

- server resolves profile and wardrobe references after authorization;
- recommendation service receives only the needed snapshot;
- AI receives structured evidence, not unrestricted database access;
- affiliate commission never influences compatibility or purchase value.

## Data lifecycle gates

| Stage | Required evidence |
| --- | --- |
| Collect | Purpose, consent version, provenance, retention choice |
| Use | Active consent, owner authorization, required scope |
| Share internally | Minimal fields, service identity, reason |
| Export | Step-up auth, dedicated scope, rate limit, expiry |
| Correct | User identity, target, explicit provenance |
| Delete | Pending record, dependent-store checklist, retry state |
| Complete deletion | Primary/object deletion, session revocation, backup expiry schedule, verification timestamp |

## Provider-selection security requirements

A production provider must support:

- secure web and native sessions with revocation;
- server-enforced row/record ownership;
- least-privilege service roles;
- encrypted private objects and expiring URLs;
- audit logs and export portability;
- deletion workflows, backup retention documentation, and regional controls;
- secret rotation, incident response, and recovery testing;
- migration without requiring clients to become canonical stores.

Provider selection, legal terms, data region, retention duration, and cost
remain founder decisions.

## Executable policy evidence

`scripts/private-access-security-policy.mjs` encodes:

- a closed, short-lived session contract;
- same-account and required-scope authorization;
- anti-CSRF evidence for web mutations;
- a minimal allowlisted extension message;
- recursive sensitive-key rejection;
- fail-closed deletion-completion evidence.

The harness uses fixtures only. It creates no account, credential, provider,
browser permission, or network endpoint.

## Residual risks and next gate

Architecture cannot prove a provider configuration is secure. Before real
users:

1. select a provider and data region with founder/legal/privacy review;
2. convert these invariants into database, object, and API policies;
3. test locally or ephemerally with synthetic accounts;
4. independently review authorization and deletion paths;
5. approve the exact extension permission manifest;
6. complete incident, backup restore, and key-rotation drills.
