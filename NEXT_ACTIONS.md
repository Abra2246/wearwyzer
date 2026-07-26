# WearWyzer next actions

This is the executable handoff queue. The Book of Truth owns product direction,
GitHub issues own implementation scope, and this file identifies the next safe
action from current evidence.

**Last verified:** July 26, 2026
**Evidence baseline:** `main` after merged PR #86 (Issue #85 threat model) and
direct implementation of Issue #87 on `claude/issue-87-consent-correction-center`.

## Active review gates

1. **Issue #87 — fixture-only consent and correction center**
   - Active branch: `claude/issue-87-consent-correction-center`.
   - Scope: default-off, noindex, unlinked `consent-correction-center.dc.html`
     over the Issue #83/#84 private-service contract — purpose-specific
     consent with fail-closed dependent evaluation, editable Style DNA/Fit DNA
     with explicit-over-inferred correction, wardrobe snapshot freshness,
     versioned export, pending/completed deletion with dependent-store
     evidence, and a deterministic reset.
   - Human gate: architecture/privacy review only. No provider, production
     account, database, personal data, photos, or browser permission is
     authorized.

## Next executable tasks

1. **Complete and review Issue #87**
   - Outcome: 513/513 repository tests pass (21 new), all five validators
     pass, and headless-browser QA covered default-off, consent revoke,
     correction override, export, deletion, reset, mobile layout, keyboard
     operation, and a clean console.
2. **Establish the first verifiable affiliate merchant path**
   - Dependency: approved public product feed or affiliate-network/retailer
     credentials.
   - Outcome: verify exact offers and move planned guide coverage toward 80%
     without changing editorial recommendations merely for commission.
3. **Reconcile and import remaining style-guide sources when real files exist**
   - Current evidence: six complete seven-slide guides exist; the expected
     other six are absent from the repository, visible branches, workspace,
     and synced project sources.
   - Outcome: import real files when supplied; never manufacture missing
     guides.

## Closed or blocked with evidence

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
