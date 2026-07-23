# WearWyzer Autonomous Engineering v1

## Goal
Create a controlled engineering loop that can select approved work, trigger Claude, validate changes, merge only low-risk work, deploy, and continue to the next eligible issue without requiring Terminal or manual prompt relays.

## Safety model

### Low risk
May auto-merge after all required checks pass:
- documentation
- deterministic validators
- metadata
- narrowly scoped non-visual content/data corrections
- test-only changes

### Medium risk
May auto-implement and open a PR, but must stop before merge:
- new customer-facing pages
- recommendation logic
- navigation changes
- reusable UI components
- data-model extensions

### High risk
Always requires explicit approval before implementation or merge:
- secrets and credentials
- payments or authentication
- legal or privacy copy
- workflow permission changes
- destructive migrations
- external publishing
- production infrastructure changes

## Queue contract
Eligible issues must have:
- label `ready`
- exactly one risk label: `risk-low`, `risk-medium`, or `risk-high`
- complete objective, scope, exclusions, acceptance criteria, and validation sections
- no unresolved dependency recorded in the issue body

The dispatcher must not claim work when:
- another issue has label `in-progress`
- an open implementation PR exists with label `automation-managed`
- the candidate is high risk
- the candidate lacks the required specification fields

### Ready label versus dispatch eligibility

The `ready` label is a nomination, not proof that an issue can be dispatched. The dispatcher,
Mission Control, and issue-contract lint all consume the same validator in
`scripts/queue-rules.mjs`.

- `labeledReadyCount` counts issues carrying `ready`.
- `eligibleReadyCount` counts only ready issues that pass risk, dependency, and contract checks.
- rejected issues are grouped as malformed, risk-gated, or dependency-blocked with exact reasons.
- only `eligibleReadyCount` may trigger a stalled-dispatch alert.

Run `node scripts/lint-issue-contracts.mjs` to fail visibly when a ready-labeled issue is not
actually eligible.

## State transitions

`backlog` → `ready` → `in-progress` → `review` → `done`

Failure states:
- `blocked`
- `needs-human`
- `automation-failed`

## Dispatcher behavior
1. Run on a conservative schedule and manual dispatch.
2. Exit without changes if active automated work exists.
3. Select the highest-priority eligible `ready` issue.
4. Add `in-progress`, remove `ready`, record the dispatch on the issue, and invoke
   the existing Claude Code workflow through its explicit `workflow_dispatch`
   entry point.
5. Record the dispatch time and selected risk tier.
6. Never trigger more than one issue per run.

An `@claude` comment created with a workflow's built-in `GITHUB_TOKEN` cannot
start another GitHub Actions workflow; GitHub suppresses that recursive trigger
by design. The dispatcher therefore uses `actions: write` only to invoke the
existing `claude.yml` workflow directly. It introduces no PAT or additional
secret. If that invocation fails, the issue is returned to `ready`, labeled
`automation-failed` and `needs-human`, and the dispatcher run fails visibly.

### Immediate implementation-run postcondition

The active Claude workflow fails closed after every queue dispatch. A successful agent process is
not sufficient evidence of completed work. `scripts/verify-agent-handoff.mjs` requires one of:

1. an open PR from the issue's `claude/issue-<N>-*` branch;
2. a matching branch with a non-empty diff from `main`; or
3. an issue already moved out of `in-progress` into `blocked` + `needs-human`, with the structured
   `automation-handoff:evidence-backed-blocker` marker and evidence comment.

If none exists, the same workflow becomes failed, removes `in-progress`, adds
`automation-failed` + `needs-human`, and posts the run URL plus the safely extracted permission
denial count (or `unknown`). The execution output itself is never printed. The scheduled handoff
watchdog remains a secondary repair layer for branch-without-PR cases.

## Merge behavior
- `risk-low`: auto-merge only when the PR is labeled `automation-managed` and `risk-low`, every required check succeeds, the PR is not draft, and protected paths are untouched.
- `risk-medium`: stop in review.
- `risk-high`: stop before implementation unless explicitly approved.

Protected paths include:
- `.github/workflows/**`
- authentication, payment, legal, privacy, and secret-management files
- deployment credentials and infrastructure

## Continuation
After a low-risk automated merge, the dispatcher may run again and claim the next eligible issue. Medium-risk work waits for review and therefore pauses the queue.

## Observability
Every dispatch or failure must leave a GitHub comment with:
- selected issue
- risk tier
- current state
- next expected event
- blocking reason when applicable

## Incident suspension (issue #17)
An open `site-incident` issue (opened automatically by `scripts/deploy-health-check-cli.mjs` when a post-deploy health check fails) suspends this entire queue — `canDispatch()` in `scripts/queue-rules.mjs` checks it before every other gate, ahead of in-progress work or open PRs. This applies to every kind of work the queue dispatches (engineering issues, site upgrades, guide factory jobs alike). See `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` §4 and `docs/INCIDENT_RUNBOOK.md` for the full contract and human response procedure.

## Source of truth
GitHub labels and issue bodies are the execution source of truth. Notion remains the strategic Book of Truth. Major workflow changes must be mirrored in both.
