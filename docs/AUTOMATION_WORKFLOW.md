# Automation workflow

This document describes the issue-driven engineering workflow this repo is set up for, what's already wired up, and what's intentionally deferred.

## Intended workflow

```
GitHub issue → Claude implementation → branch → tests → PR → preview → review → merge
```

1. **GitHub issue** — Every engineering task starts as an issue using the [`Engineering task`](../.github/ISSUE_TEMPLATE/engineering-task.yml) template. It forces the objective, source specification, scope, exclusions, acceptance criteria, validation requirements, risk tier, and whether automatic implementation is allowed to be stated up front — the same information an agent (or a human) needs to avoid the scope-creep and unverified-claim failures already catalogued in `CHANGELOG.md` (e.g. the Guide #3 controller shipping blank, or the `productId` mismatches).
2. **Claude implementation** — For issues marked "automatic implementation allowed," Claude (or another engineer) implements the change on a new branch, following `CLAUDE.md`, `CONTRIBUTING.md`, and this repo's content-integrity rules.
3. **Branch** — One branch per issue, named for the change (e.g. `chore/preview-and-automation-foundation`).
4. **Tests** — `node scripts/validate-content-data.mjs` for any `js/guides.js`/`js/products.js` change, `node scripts/qa-static-site.mjs` for any page/asset/local-link change, plus manual verification via `./scripts/preview.sh` (see [README.md](../README.md) and `DEVELOPMENT.md`) — this repo has no automated test suite, so a loaded page with a clean console is the actual bar for "done" per `CLAUDE.md`.
5. **PR** — Opened using [`.github/pull_request_template.md`](../.github/pull_request_template.md), which links back to the issue and re-states scope, validation, and risk tier so a reviewer can check the PR against what was actually approved in the issue.
6. **Preview** — Every push to `main` deploys automatically to GitHub Pages (`.github/workflows/pages.yml`); PR branches can be checked locally with `./scripts/preview.sh` before merge (GitHub Pages previews are configured for `main` only in this milestone — see "Next integration step" below for branch/PR previews).
7. **Review** — A human (Abraham, or whoever owns the risk tier for that change) reviews the PR against its linked issue's acceptance criteria before merging.
8. **Merge** — Squash or merge per the reviewer's normal preference; merging to `main` triggers the Pages deploy.

## What's wired up today

- `.github/ISSUE_TEMPLATE/engineering-task.yml` — the structured issue form described above.
- `.github/pull_request_template.md` — the PR checklist described above.
- `.github/workflows/content-validation.yml` — CI, runs `scripts/validate-content-data.mjs` and `scripts/qa-static-site.mjs` (as separate jobs) on every PR and push to `main`.
- `.github/workflows/pages.yml` — new. Runs the same content validator, then deploys the repository to GitHub Pages on every push to `main` (or manually via `workflow_dispatch`).
- `scripts/preview.sh` — local, dependency-free preview server for manual verification before opening a PR.

## What's deferred: an AI GitHub Action

This workflow does **not** yet install an AI GitHub Action (e.g. one that lets Claude respond to issues/PR comments directly inside GitHub) or configure an API key/secret for one. That's the natural next integration step once this foundation is reviewed, but it requires:
- Abraham's authorization to install a GitHub App / Action into the repo (an account-level decision, not something to do unilaterally from an issue).
- Generating and storing an Anthropic API key as a repository or environment secret, scoped appropriately (e.g. restricted to a `claude-automation` environment requiring approval for high-risk-tier issues).
- Deciding which risk tiers (see the issue template) are eligible for the Action to open PRs against unattended, versus requiring a human to kick off implementation manually (as this milestone's workflow assumes).

Until that's set up, "Claude implementation" in the workflow above means: a human pastes the issue into a Claude Code session (as happened for this task) and drives it through the branch/PR steps manually.

## Autonomous queue (v1)

`docs/AUTONOMOUS_ENGINEERING_V1.md` is the canonical spec for a controlled queue that selects, dispatches, and tracks approved issues without a human relaying prompts through a terminal. As of issue #16, the queue's logic is implemented and tested; its scheduled triggers are staged but not yet active (see "Activation checklist" below).

### What's implemented
- `scripts/queue-rules.mjs` — pure, unit-tested rule functions: issue-spec validation, risk-tier/priority parsing, deterministic selection, PR↔issue linking, protected-path detection, and the low-risk auto-merge eligibility gate. No I/O; see `scripts/__tests__/`.
- `scripts/queue-github-client.mjs` — a minimal, dependency-free GitHub REST/GraphQL client (Node's built-in `fetch`, no npm packages) reading `GITHUB_TOKEN`/`GITHUB_REPOSITORY` from the environment. No new secret.
- `scripts/queue-labels.mjs` — idempotently creates/updates the label contract below without deleting anything it doesn't own. Run with `node scripts/queue-labels.mjs [--dry-run]`.
- `scripts/queue-dispatch.mjs` — the dispatcher. Exits without changes if another issue is `in-progress` or an `automation-managed` PR is open; otherwise deterministically selects the highest-priority eligible `ready` issue (rejecting `risk-high` and malformed issues), removes `ready`, adds `in-progress` + `automation-managed`, and posts one `@claude` implementation comment recording the risk tier, selection reason, and next expected event. Run with `node scripts/queue-dispatch.mjs [--dry-run]`.
- `scripts/queue-pr-state.mjs` — `sync --pr <N>` moves an `automation-managed` issue from `in-progress` to `review` once its linked (`Closes #N`) PR is open and not a draft, and reports (but never executes) the low-risk auto-merge gate on every non-draft `automation-managed` PR. `mark-failed --issue <N> --reason "..."` labels an issue `automation-failed` + `needs-human` with an explanatory comment when a run can't complete.

### Label contract
`ready`, `in-progress`, `review`, `blocked`, `needs-human`, `automation-failed`, `automation-managed`, `risk-low`, `risk-medium`, `risk-high`, `priority-p0`…`priority-p3` (unset defaults to `p2`). Full colors/descriptions in `scripts/queue-labels.mjs`.

### Guarded low-risk auto-merge — disabled by default
`evaluateAutoMergeEligibility()` requires *all* of: issue and PR both labeled `automation-managed` + `risk-low`, PR not draft, all discoverable status checks/check-runs successful, no protected path changed (`PROTECTED_PATH_PATTERNS` in `scripts/queue-rules.mjs` — workflow files, `support.js`, `image-slot.js`, legal pages, anything matching `secret`/`credential`/`.env`), zero unresolved review threads, **and** the `AUTOMATION_AUTO_MERGE_ENABLED` repository variable set to the literal string `"true"`. That variable does not exist in this repo today, so the gate always reports `blocked` regardless of the other conditions — and even when every condition is met, `scripts/queue-pr-state.mjs` only logs `ELIGIBLE`; it does not call a merge API. Wiring up an actual automatic merge is a deliberately separate, future decision.

### Activation checklist
The queue's logic ships in this PR; making it run on a schedule requires a maintainer with `.github/workflows/` edit access (Claude's GitHub App token intentionally does not have this — see this repo's automation permission model) to:
1. Copy `docs/automation/workflows/sync-labels.yml`, `dispatch-queue.yml`, and `pr-state-sync.yml` into `.github/workflows/`, then run the label-sync workflow once (or `node scripts/queue-labels.mjs` locally) to create the label contract.
2. Confirm `Settings → Actions → General → Workflow permissions` allows `issues: write` for the default `GITHUB_TOKEN` (same setting already required for `.github/workflows/claude.yml`).
3. Leave `AUTOMATION_AUTO_MERGE_ENABLED` unset (or `"false"`) to keep the merge gate closed; only a maintainer decision changes that.
4. Optionally copy `mark-failed.yml` and wire a step into `.github/workflows/claude.yml` (also outside Claude's edit permission) that calls it when the implementation job's conclusion is `failure`.

### Testing
```
node --test scripts/__tests__/
```
Zero dependencies, deterministic, fixture-driven (`scripts/__tests__/fixtures.mjs`) — no network access, no mutation of the real repo. Covers: no eligible issue, active work blocking dispatch, malformed-issue rejection, risk-high rejection, deterministic priority ordering, exactly-one-issue-per-dispatch, dry-run-causes-no-mutation, protected-path detection, and the merge gate defaulting to `false`.

## One-time GitHub repository settings required

- **Settings → Pages → Build and deployment → Source**: set to **GitHub Actions** (not "Deploy from a branch"). Without this, `.github/workflows/pages.yml` will fail at the `actions/deploy-pages` step with a permissions/configuration error.
- Optionally, **Settings → Actions → General → Workflow permissions**: confirm `id-token: write` and `pages: write` are permitted for the repo (default GitHub Pages-enabled repos already allow this; only relevant if the org has tightened default `GITHUB_TOKEN` permissions).
