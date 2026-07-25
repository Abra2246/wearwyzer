# WearWyzer next actions

This is the executable handoff queue. The Book of Truth owns product direction,
GitHub issues own implementation scope, and this file identifies the next safe
action from current evidence.

**Last verified:** July 25, 2026
**Evidence baseline:** `main` after merged PR #82, the live Mission Control
refresh at `2026-07-25T23:25:01.306Z`, 475 passing tests on the API-contract
slice, and the active provider-agnostic Issue #83 branch.

## Active review gates

1. **Issue #83 — private profile and wardrobe service boundary**
   - Active branch: `codex/private-profile-service-v1`.
   - Scope: closed private record schemas, same-account authorization,
     purpose-specific consent, corrections, export, deletion, and minimized
     audit evidence.
   - Human gate: architecture review only. No provider, production account,
     database, personal data, or browser permission is authorized.

## Next executable tasks

1. **Complete and review Issue #83**
   - Outcome: define how future authenticated services protect private profile
     and wardrobe facts while the merged recommendation API stays
     data-minimized.
2. **Establish the first verifiable affiliate merchant path**
   - Dependency: approved public product feed or affiliate-network/retailer
     credentials.
   - Outcome: verify exact offers and move planned guide coverage toward 80%
     without changing editorial recommendations merely for commission.
3. **Threat-model the first authenticated account flow**
   - Dependency: Issue #83 review and founder selection of a production
     architecture.
   - Outcome: explicit session, service-role, export, deletion, photo, and
     extension boundaries before real-user implementation.
4. **Reconcile and import remaining style-guide sources when real files exist**
   - Current evidence: six complete seven-slide guides exist; the expected
     other six are absent from the repository, visible branches, workspace,
     and synced project sources.
   - Outcome: import real files when supplied; never manufacture missing
     guides.

## Closed or blocked with evidence

- **Issue #54:** closed as not planned. Its exact New Balance 9060 is sold out
  and inside the 60-day hero cooldown; Issue #62 supersedes the pilot.
- **Issue #57 / PR #80:** merged after review. The fixture-only personalized
  purchase slice is deployed behind its default-off, non-indexed gate.
- **Issue #81 / PR #82:** merged after 475 tests and five passing GitHub checks.
  The future website, app, and extension now share a proposed
  privacy-minimized personalization contract.
- **Issue #71:** closed by merged PR #73. The live feed now contains real
  Guide Factory evidence and fail-closed image/affiliate sources; the first
  post-merge refresh completed successfully.
- **Issue #62 / PR #68:** merged after editorial review and exact-product
  correction. The current production guide gate is complete.
- **Issue #76 / PR #77:** Mission Control startup no longer depends on a
  third-party CDN and retries failed startup imports.
- **PR #79:** sitemap routes now match the deployed `.dc.html` artifacts.
- **Issue #33 — Chrome extension:** blocked by the personalization slice,
  public product/offer API, consent/privacy boundaries, and explicit browser
  permission and store-publication approval.
- Live affiliate credentials, real personal wardrobe data, paid image-budget
  changes, social publishing, production authentication, and personalized
  likeness generation require explicit authorization.

## Queue rules

- Prefer one thin vertical slice over a broad platform build.
- Do not dispatch new implementation while a related review PR is unresolved.
- Update issue labels from evidence, not expectation.
- Link every branch and PR to its owning issue.
- Record exact tests, validators, spend, coverage, and source timestamps.
- Update Mission Control source data and the Book of Truth execution record
  after every material milestone.
- Keep at least three ordered next actions here; remove superseded work rather
  than leaving contradictory active items.
