# WearWyzer next actions

This is the executable handoff queue. The Book of Truth owns product direction,
GitHub issues own implementation scope, and this file identifies the next safe
action from current evidence.

**Last verified:** July 26, 2026
**Evidence baseline:** `main` after merged PR #108. The workflow-hygiene change
passed 603 tests, all deterministic validators, five GitHub checks, serialized
Ops refreshes, Pages deployment, and Deploy Health Check run `30183382194`.
Every production job reported zero annotations. Issue #109 is active.

## Active review gates

1. **Issue #109 — offline AI Stylist candidate replay gate**
   - Active branch: `codex/issue-109-stylist-replay-gate`.
   - Scope: closed synthetic candidate envelopes, trusted-corpus replay,
     sanitized comparison, 100% trust thresholds, and explicit ties.
   - Boundary: no live provider, credentials, prompt experiment, real data,
     network, paid call, production telemetry, or external action.

## Next executable tasks

1. **Complete and review Issue #109**
   - Outcome: compare synthetic candidate answers against the complete trusted
     corpus without letting candidates control evidence or thresholds.
2. **Define the human editorial preference rubric**
   - Dependency: Issue #109 must preserve the non-negotiable trust gate.
   - Outcome: score usefulness, clarity, styling quality, tone, and
     actionability only after safety eligibility; never let preference override
     grounding or privacy.
3. **Establish the first verifiable affiliate merchant path**
   - Dependency: approved public product feed or affiliate-network/retailer
     credentials.
   - Outcome: verify exact offers and move planned guide coverage toward 80%
     without changing editorial recommendations merely for commission.
4. **Reconcile and import remaining style-guide sources when real files exist**
   - Current evidence: six complete seven-slide guides exist; the expected
     other six are absent from the repository, visible branches, workspace,
     and synced project sources.
   - Outcome: import real files when supplied; never manufacture missing
     guides.

## Closed or blocked with evidence

- **Issue #102 / PR #108:** merged after 603 tests, every deterministic
  validator, five passing GitHub checks, serialized Ops refresh, Pages, and
  Deploy Health Check run `30183382194`. Ten production jobs returned zero
  annotations; the Node and Pages input warnings are gone.
- **Issue #106 / PR #107:** merged after 600 tests, every deterministic
  validator, browser QA across all six intent and both abstention paths, five
  passing GitHub checks, serialized Ops refresh, successful Pages deployment,
  and Deploy Health Check run `30183222739`.
- **Issue #104 / PR #105:** merged after 589 tests, a 15-scenario portfolio
  scoring 100% across all six trust metrics, five GitHub checks, serialized Ops
  refresh, successful Pages deployment, and health check.
- **Issue #101 / PR #103:** merged after 579 tests, five passing GitHub checks,
  serialized Ops refresh, successful Pages deployment, and health check.
- **Issue #99 / PR #100:** merged after 568 tests, five passing GitHub checks,
  serialized Ops refresh, successful Pages deployment, and health check.
- **Issue #97 / PR #98:** merged after 558 tests, five passing GitHub checks,
  serialized Ops refresh, successful Pages deployment, and health check.
- **Issue #95 / PR #96:** merged after 549 tests, five passing GitHub checks,
  clean-console browser QA, successful Pages deployment, and health check.
- **Issue #93 / PR #94:** merged after 539 tests and five passing GitHub checks.
  Production Live Feed and Status runs succeeded in serialized order; exactly
  one fresh commit per artifact reached `main`, with no cross-trigger loop.
- **Issue #89 / PR #92:** merged after 539 tests, five passing GitHub checks,
  end-to-end browser review, and explicit product/privacy scope review. The
  route remains unlinked, `noindex`, default-off, and synthetic.
- **Issue #90 / PR #91:** merged after 521 tests and five passing checks. A
  production dry run confirmed a current active implementation remains pending
  and receives no failure-label mutation.
- **Issue #87 / PR #88:** merged after 513 tests, five passing GitHub checks,
  independent browser review, and successful post-merge Pages/health checks.
- **Issue #85 / PR #86:** merged after 492 tests and passing GitHub checks. The
  private-data threat model, threat register, and executable fail-closed
  session/extension-message/deletion policies are now repository evidence.
- **Issue #54:** closed as not planned. Its exact New Balance 9060 is sold out
  and inside the 60-day hero cooldown; Issue #62 supersedes the pilot.
- **Issue #57 / PR #80:** merged after review. The fixture-only personalized
  purchase slice is deployed behind its default-off, non-indexed gate.
- **Issue #81 / PR #82:** merged after 475 tests and five passing GitHub checks.
  The future website, app, and extension now share a proposed
  privacy-minimized personalization contract.
- **Issue #83 / PR #84:** merged after 484 tests and five passing GitHub checks.
  Private records now have provider-agnostic ownership, consent, correction,
  export, deletion, and audit contracts.
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
