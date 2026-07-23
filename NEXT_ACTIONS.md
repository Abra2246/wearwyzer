# WearWyzer next actions

This is the executable handoff queue. It is intentionally short. The Book of Truth owns product
direction; GitHub issues own implementation scope; this file tells the next operator what to do.

**Last verified:** July 23, 2026  
**Evidence baseline:** `main` at PR #63 plus recurring operations commits

## Active

1. **Issue #55 — queue eligibility in Mission Control**
   - State: complete via PR #63.
   - Evidence: 415 tests and all content/site/graph/hero validators passed; Mission Control,
     dispatcher, and issue lint now share one eligibility model.
2. **Issue #61 — fail false-success agent handoffs**
   - State: direct implementation in progress.
   - Owner: reliability lead; workflow-changing review PR is the next evidence.
   - Outcome: queue-dispatched agent jobs fail unless they leave a linked PR, a non-empty issue
     branch, or a structured evidence-backed blocker.
3. **Issue #54 — first Guide Factory production pilot**
   - State: blocked with evidence.
   - Reason: the verified New Balance 9060 is sold out and violates the repository's 60-day hero
     cooldown because the same hero was used on July 9, 2026.
   - No manifest, generated asset, paid call, PR, or publication was created.

## Next three executable tasks

1. **Issue #11 — HTML metadata and unresolved-template QA**
   - Dependency: #61 reaches review or an actionable blocker.
   - Outcome: deterministic metadata QA that understands intentional runtime bindings and gates
     PRs/Pages without reviving the former raw-template false positive.
2. **Issue #62 — verified adidas Samba production pilot**
   - Dependency: #55, #61, and #11 are stable.
   - Outcome: use official B75806 product evidence to prove the review-gated Guide Factory path
     without the cooldown and availability conflict that blocked #54.
3. **Issue #57 — personalization vertical slice**
   - Dependency: #62 proves the current production path and the privacy boundary remains
     feature-flagged with fixture-only data.
   - Outcome: manually add a style profile and wardrobe items, evaluate one prospective product,
     and return compatibility, outfit, redundancy/gap, and buy/wait/skip evidence.

## Blocked / later

- **Issue #33 — Chrome extension:** blocked by the personalization slice, public API boundary,
  offer routing, privacy review, and explicit permission/store-publishing approval.
- Live affiliate-account credentials, real personal wardrobe data, paid image-budget changes,
  publishing to social platforms, and production authentication require explicit authorization.

## Cycle closeout checklist

- Update issue labels from evidence, not expectation.
- Link branch and PR to the issue.
- Record exact tests and validation output.
- Update Mission Control source data.
- Update the Book of Truth execution record when a material milestone changes.
- Refresh this file so the next operator has three executable tasks.
