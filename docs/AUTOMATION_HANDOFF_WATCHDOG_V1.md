# WearWyzer Automation Completion Handoff Watchdog v1 (issue #22)

## Problem

Issue #16 and issue #17 both completed their implementation, pushed a branch, and posted a
completion comment — but neither run opened a PR itself; the comment only linked a
"create a PR" URL for a human to click. Nothing in the queue (`scripts/queue-pr-state.mjs
sync`) runs until a PR *already exists and fires a webhook*, so both issues sat labeled
`in-progress` for hours until a maintainer noticed, opened the PR by hand, and — for #17 —
separately noticed and promoted its staged workflow files into `.github/workflows/`. The
queue had no mechanism that watched for "implementation finished, nothing happened next."

## Goal

Detect that shape — an `automation-managed` issue still `in-progress` with a pushed branch
and no PR — and either repair it automatically or escalate precisely, so an issue can never
stay falsely `in-progress` indefinitely after its implementation run has actually finished.

## What's implemented

- `scripts/handoff-watchdog-rules.mjs` — pure, dependency-free decision logic (`planWatchdogAction`
  and helpers). No I/O; unit-tested in `scripts/__tests__/handoff-watchdog-rules.test.mjs`,
  including fixtures reproducing the exact #16 and #17 branch/file shapes.
- `scripts/queue-github-client.mjs` — extended with the read/write calls the watchdog needs:
  `listMatchingBranchRefs` (branch discovery by prefix, via
  `GET /git/matching-refs/heads/{prefix}`, which 200s with `[]` rather than 404ing when
  nothing matches yet), `getBranchLastCommitIso`, `listOpenPullRequestsForBranch`,
  `compareCommits` (changed-files diff against `main`), `createPullRequest`,
  `listIssueComments`, and a best-effort, always-non-throwing `listWorkflowRunsForBranch`
  used only to enrich status output, never to gate a decision.
- `scripts/handoff-watchdog.mjs` — the orchestrator/CLI (`node scripts/handoff-watchdog.mjs
  [--dry-run] [--now <iso>]`), following the same pure-logic/thin-IO split as
  `scripts/queue-dispatch.mjs`. Integration-tested with a fake GitHub client in
  `scripts/__tests__/handoff-watchdog.test.mjs`.
- `docs/automation/workflows/handoff-watchdog.yml` — staged, not active (see "Activation
  checklist" below), scheduled every 5 minutes.

## How it works

For every open issue labeled both `in-progress` and `automation-managed`:

1. **Discover the branch.** Claude's own implementation workflow always names its branch
   `claude/issue-<N>-<timestamp>` (this repo's own real branches — e.g.
   `claude/issue-16-20260713-0156`, `claude/issue-17-20260713-0336` — confirm this).
   `listMatchingBranchRefs('claude/issue-<N>-')` finds every branch matching that prefix for
   the issue; the most recently committed one is selected if more than one exists.
2. **Check for an existing PR.** `listOpenPullRequestsForBranch` — if one is already open, the
   existing `scripts/queue-pr-state.mjs sync` flow (triggered by the PR's own webhook events)
   owns the rest of the lifecycle; the watchdog only continues to check for unflagged staged
   workflow files (step 4), independent of PR state.
3. **No branch at all.** If the run completed but left neither a usable branch nor an open PR,
   the issue is marked `automation-failed` + `needs-human` with one explanatory comment — the
   same failure-state the queue already uses for a run that errors out
   (`scripts/queue-rules.mjs`'s `determineFailureAction`), reached here as a distinct trigger
   path instead of a duplicated implementation.
4. **Staged workflow files.** `compareCommits('main', branch)` (or the PR's own changed-files
   list, if one exists) is scanned for any file under `docs/automation/workflows/` — this
   repo's own convention for a workflow file Claude's GitHub App token cannot commit directly
   into `.github/workflows/`. If any are present and not already flagged, one comment naming
   the exact files is posted and the issue gets `needs-human`. This check fires regardless of
   the grace period or PR state, because leaving a promotion step silently undiscovered is
   precisely the issue #17 failure mode.
5. **Grace period.** If there's a branch, no PR, and no staged files needing an immediate flag,
   the watchdog waits `GRACE_PERIOD_MINUTES` (15, matching the issue's acceptance criterion)
   from the branch's last commit before treating it as stalled — this avoids racing an
   implementation that is still actively pushing commits.
6. **Repair.** Once the grace period elapses with still no PR, the watchdog opens a **draft**
   PR itself (`head` = the discovered branch, `base` = `main`, body containing `Closes #N`),
   labels it `automation-managed` + the issue's risk label, and moves the issue from
   `in-progress` to `review` — reflecting that a maintainer now has something to look at, even
   though the PR is a draft. (This is a narrower, watchdog-specific rule than
   `scripts/queue-rules.mjs`'s `determinePrSyncAction`, which intentionally waits for a
   *non-draft* PR before moving an issue to `review` for the general auto-merge-eligibility
   flow — the two don't conflict: once the watchdog's action removes `in-progress`,
   `determinePrSyncAction`'s own check for that label naturally becomes a no-op.)

## Idempotency

Every mutating action embeds a distinct HTML-comment marker in the comment it posts
(`<!-- handoff-watchdog:draft-pr-opened -->`, `...:staged-workflow-flagged`,
`...:escalated-no-branch`). Before acting, the watchdog scans the issue's existing comments
for that marker and skips the action if already present. This, combined with re-checking PR
existence on every pass, is why running the watchdog twice in a row against the same state
never opens a second PR, re-flags the same files, or posts a duplicate comment — see the
"idempotency" tests in `scripts/__tests__/handoff-watchdog.test.mjs`.

## Heartbeat / status output

Every evaluated issue produces one JSON event via `scripts/status-log.mjs` /
`scripts/record-status-event.mjs`, appended to `automation/status/events.jsonl` (kind
`routine` for pending/no-op/successful-repair, kind `exception` for an escalation or a staged-
workflow flag — reusing the existing dashboard-ready log from issue #17 rather than inventing
a new status file). Each event's `detail` is a JSON string recording exactly what issue #22
asked for: `issueNumber`, `branch`, `lastActivityAt` (the branch's last commit timestamp),
`prNumber`, a best-effort `workflowRun` (id/url/conclusion, when discoverable), and `step`
(the plan type — `pending` / `repair` / `escalate-no-branch` / `noop`).

## Known v1 simplifications

- Branch discovery assumes Claude's implementation workflow always uses the
  `claude/issue-<N>-<timestamp>` naming convention (true for every branch this repo has ever
  produced). A branch named anything else for the same issue would not be found.
- If no branch is found at all, the watchdog does not search for an open PR by any other means
  (e.g. a PR whose body references `Closes #N` from an unrelated branch name) before escalating
  — in practice every PR this queue's issues produce is opened from a `claude/issue-<N>-*`
  branch, so this hasn't been a gap, but it is a real limitation if that convention ever
  changes.
- `listWorkflowRunsForBranch` is enrichment only; if the Actions API call fails for any reason
  (permissions, a renamed workflow file), the watchdog proceeds without that metadata rather
  than failing the whole pass.
- The watchdog does not attempt to open a PR for a branch that lives in a fork — this repo's
  automation only ever produces same-repository branches, so that scope note in the issue is
  satisfied trivially rather than by an explicit fork check.

## Activation checklist (in addition to issue #16/#17's)

1. Copy `docs/automation/workflows/handoff-watchdog.yml` into `.github/workflows/` (same
   workflow-edit-permission constraint as every other staged workflow in this repo — Claude's
   GitHub App token cannot do this itself).
2. Confirm `Settings → Actions → General → Workflow permissions` allows `issues: write` and
   `pull-requests: write` for the default `GITHUB_TOKEN` (a superset of what issue #16's
   workflows already require — `pull-requests: write` is new, needed to open the repair PR).
3. No new label is required — the watchdog only ever applies `review`, `needs-human`,
   `automation-failed`, and PR-side `automation-managed`/`risk-*`, all already in the label
   contract (`docs/AUTOMATION_WORKFLOW.md`).

## Testing

```
node --test scripts/__tests__/handoff-watchdog-rules.test.mjs scripts/__tests__/handoff-watchdog.test.mjs
node --test scripts/__tests__/*.test.mjs   # full suite, confirms no regression
```

Zero dependencies, deterministic, no network access, no mutation of the real repo — the
GitHub client is fully faked in tests, matching every other script in this queue.
