# WearWyzer next actions

This is the executable handoff queue. It is intentionally short. The Book of Truth owns product
direction; GitHub issues own implementation scope; this file tells the next operator what to do.

**Last verified:** July 23, 2026  
**Evidence baseline:** `main` at PR #60 plus recurring operations commits

## Active

1. **Issue #55 — queue eligibility in Mission Control**
   - State: direct implementation in progress after the dispatched agent run returned success
     without a branch or PR.
   - Owner: reliability lead; review PR is the next evidence.
   - Outcome: dispatcher, dashboard, and lint share one eligibility model; malformed,
     dependency-blocked, and risk-gated ready labels are visible without creating false stalls.
2. **Issue #54 — first Guide Factory production pilot**
   - State: blocked with evidence.
   - Reason: the verified New Balance 9060 is sold out and violates the repository's 60-day hero
     cooldown because the same hero was used on July 9, 2026.
   - No manifest, generated asset, paid call, PR, or publication was created.

## Next three executable tasks

1. **Issue #61 — fail false-success agent handoffs**
   - Dependency: #55 reaches review or an actionable blocker.
   - Outcome: a dispatched run cannot succeed unless it leaves evidence of a PR, an implementation
     branch, or an explicit evidence-backed blocker.
2. **Issue #11 — HTML metadata and unresolved-template QA**
   - Dependency: #61 reaches review or an actionable blocker.
   - Outcome: deterministic metadata QA that understands intentional runtime bindings and gates
     PRs/Pages without reviving the former raw-template false positive.
3. **Issue #62 — verified adidas Samba production pilot**
   - Dependency: #55, #61, and #11 are stable.
   - Outcome: use official B75806 product evidence to prove the review-gated Guide Factory path
     without the cooldown and availability conflict that blocked #54.

## Blocked / later

- **Issue #33 — Chrome extension:** blocked by the personalization slice, public API boundary,
  offer routing, privacy review, and explicit permission/store-publishing approval.
- **Issue #57 — personalization vertical slice:** feature-flagged and implementation-ready, but
  intentionally sequenced after the P0 reliability loop and first production pilot.
- Live affiliate-account credentials, paid image-budget changes, publishing to social platforms,
  and production authentication require explicit authorization.

## Cycle closeout checklist

- Update issue labels from evidence, not expectation.
- Link branch and PR to the issue.
- Record exact tests and validation output.
- Update Mission Control source data.
- Update the Book of Truth execution record when a material milestone changes.
- Refresh this file so the next operator has three executable tasks.
