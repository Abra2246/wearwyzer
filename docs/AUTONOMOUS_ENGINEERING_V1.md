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
4. Add `in-progress`, remove `ready`, and post an `@claude` implementation instruction.
5. Record the dispatch time and selected risk tier.
6. Never trigger more than one issue per run.

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

## Source of truth
GitHub labels and issue bodies are the execution source of truth. Notion remains the strategic Book of Truth. Major workflow changes must be mirrored in both.
