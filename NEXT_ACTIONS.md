# WearWyzer next actions

This is the executable handoff queue. The Book of Truth owns product direction,
GitHub issues own implementation scope, and this file identifies the next safe
action from current evidence.

**Last verified:** July 25, 2026
**Evidence baseline:** `main` at `3cbe7e4`, the successful post-merge Pages
deployment, the merged Issue #57 personalization slice, and the
privacy-minimized Issue #81 API-contract branch.

## Active review gates

1. **Issue #81 — public/private personalization API boundary**
   - Active branch: `codex/personalization-api-v1`.
   - Review evidence: closed versioned request/response schemas, reference-only
     profile and wardrobe inputs, explicit consent, exact/similar/unknown
     product states, source-freshness enforcement, minimized outfit evidence,
     and deterministic privacy/negative tests.
   - Human gate: architecture review only. This does not authorize production
     authentication, real personal data, extension permissions, or public API
     deployment.

## Next executable tasks

1. **Review and merge the Issue #81 API contract**
   - Outcome: give future web, app, and extension clients one data-minimized
     recommendation contract without duplicating the wardrobe or product
     source of truth.
2. **Establish the first verifiable affiliate merchant path**
   - Dependency: approved public product feed or affiliate-network/retailer
     credentials.
   - Outcome: verify exact offers and move planned guide coverage toward 80%
     without changing editorial recommendations merely for commission.
3. **Design the authenticated profile and wardrobe service boundary**
   - Dependency: Issue #81 review; production provider selection remains a
     founder decision.
   - Outcome: storage, authorization, consent, correction, export, deletion,
     and audit contracts without collecting real data yet.
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
