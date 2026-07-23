# WearWyzer next actions

This is the executable handoff queue. It is intentionally short. The Book of Truth owns product
direction; GitHub issues own implementation scope; this file tells the next operator what to do.

**Last verified:** July 23, 2026  
**Evidence baseline:** `main` at PR #53 plus recurring operations commits

## Active

1. **Issue #54 — first review-gated Guide Factory production pilot**
   - State: dispatched and `in-progress`.
   - Owner: Claude implementation workflow; human review at PR.
   - Next evidence: implementation branch, then a review PR with exact product-source timestamp,
     five persisted slides plus cover, validation results, affiliate coverage, and spend.
   - Stop condition: unverifiable product identity/variant, missing credential, paid-generation
     control failure, or any invented fact.
2. **Issue #59 — concurrent operations-feed commit repair**
   - State: implementation and regression tests complete; review PR is the next evidence.
   - Owner: reliability lead; human review at PR because active workflows are protected paths.
   - Root cause: Live Feed and Status workflows committed different generated files from the same
     parent; the second push was rejected after the first advanced `main`.
   - Fix boundary: bounded fetch/rebase/push retries, no force push, and fail closed on conflicts.

## Next three executable tasks

1. **Issue #55 — queue eligibility in Mission Control**
   - Dependency: #54 reaches review or an actionable blocker.
   - Outcome: distinguish labeled-ready from eligible-ready; surface malformed and risk-gated
     issue reasons; add an issue-contract lint.
2. **Issue #11 — HTML metadata and unresolved-template QA**
   - Dependency: #55 reaches review or an actionable blocker.
   - Outcome: deterministic metadata QA that understands intentional runtime bindings and gates
     PRs/Pages without reviving the former raw-template false positive.
3. **Issue #57 — personalization vertical slice**
   - Dependency: canonical schema and privacy boundary in
     `docs/PERSONALIZATION_PLATFORM_V1.md`; reliability tasks above stable.
   - Outcome: feature-flagged prototype for profile + manual wardrobe + prospective purchase
     evaluation + outfit suggestions + honest buy/wait/skip recommendation.

## Blocked / later

- **Issue #33 — Chrome extension:** blocked by the personalization slice, public API boundary,
  offer routing, privacy review, and explicit permission/store-publishing approval.
- Live affiliate-account credentials, paid image-budget changes, publishing to social platforms,
  and production authentication require explicit authorization.

## Cycle closeout checklist

- Update issue labels from evidence, not expectation.
- Link branch and PR to the issue.
- Record exact tests and validation output.
- Update Mission Control source data.
- Update the Book of Truth execution record when a material milestone changes.
- Refresh this file so the next operator has three executable tasks.
