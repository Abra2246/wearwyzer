# WearWyzer next actions

This is the executable handoff queue. The Book of Truth owns product direction,
GitHub issues own implementation scope, and this file identifies the next safe
action from current evidence.

**Last verified:** July 25, 2026
**Evidence baseline:** `main` at `faed7b9`, GitHub PR/issue/Actions audit, and
445 passing local tests on `codex/issue-71-mission-control-phase3`

## Active review gates

1. **PR #68 / Issue #62 — recovered guides and verified Samba pilot**
   - State: draft, mergeable, and all five GitHub checks pass.
   - Evidence: 438 tests pass on the branch; content, site, Knowledge Graph,
     hero-page, and asset validation pass; image spend is $0.
   - Human gate: editorially inspect the recovered Samba, Dickies, and
     Birkenstock carousels before any merge or public deployment.
   - Known KPI gap: verified affiliate coverage is 0% because no live merchant
     or affiliate adapter is configured.

## Next executable tasks

1. **Issue #71 — Mission Control Phase 3 sources**
   - State: the hosted automation failed its branch/PR handoff after 12
     permission denials; direct implementation is complete locally on
     `codex/issue-71-mission-control-phase3`.
   - Evidence: 445 tests, authenticated-free live-feed dry run, static-site
     QA, and whitespace validation pass.
   - Outcome: Guide Factory, image-renderer, and affiliate cards now use
     sanitized repository artifacts; missing spend/coverage evidence remains
     unavailable rather than becoming `$0` or `0%`.
   - Next action: open a small review PR, verify CI, and merge after review.
2. **Reconcile and import the remaining style-guide sources**
   - Current evidence: six complete seven-slide guides exist; the expected
     other six are absent from the repository, visible branches, workspace,
     and synced project sources.
   - Outcome: import real files when supplied; never manufacture missing
     guides.
3. **Establish the first verifiable affiliate merchant path**
   - Dependency: approved public product feed or affiliate-network/retailer
     credentials.
   - Outcome: verify exact offers and move planned guide coverage toward 80%
     without changing editorial recommendations merely for commission.
4. **Issue #57 — fixture-only personalization vertical slice**
   - Dependency: Issue #62 completes its editorial/merge gate.
   - Outcome: evaluate one prospective item against a five-item fixture
     wardrobe and return explainable compatibility, Outfit Unlocks,
     redundancy/gap, and buy/wait/alternative/skip evidence behind a
     default-off flag.

## Closed or blocked with evidence

- **Issue #54:** closed as not planned. Its exact New Balance 9060 is sold out
  and inside the 60-day hero cooldown; Issue #62 supersedes the pilot.
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
