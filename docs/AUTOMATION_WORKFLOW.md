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
node --test scripts/__tests__/*.test.mjs
```
Zero dependencies, deterministic, fixture-driven (`scripts/__tests__/fixtures.mjs`) — no network access, no mutation of the real repo. Covers: no eligible issue, active work blocking dispatch, malformed-issue rejection, risk-high rejection, deterministic priority ordering, exactly-one-issue-per-dispatch, dry-run-causes-no-mutation, protected-path detection, and the merge gate defaulting to `false`.

## Guide factory & site health (issue #17)

`docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` is the canonical spec for the autonomous guide
manifest/pipeline, deployment health/rollback, and notification-by-exception contract built
on top of the queue above. Summary of what's implemented as of issue #17:

- `scripts/guide-manifest-schema.mjs`, `scripts/guide-factory.mjs`,
  `scripts/guide-renderer-adapter.mjs`, `scripts/content-quality-policy.mjs`,
  `scripts/guide-page-template.mjs` — the pure guide factory pipeline. Proven end-to-end
  against an isolated fixture (never real site content) with `node
  scripts/simulate-guide-factory.mjs`.
- `scripts/guide-factory-cli.mjs` — reads `automation/guide-jobs/*.json`, runs the pipeline
  against the live `data/products.js`/`js/guides.js` snapshot, and either prints a
  `ready-for-pr` evidence bundle or marks the job `needs-human` in place.
- `scripts/deploy-health-check.mjs` / `scripts/rollback.mjs` / `scripts/deploy-health-check-cli.mjs`
  — post-deploy route health checks and a reviewable-PR-only rollback plan. See
  `docs/INCIDENT_RUNBOOK.md` for the human response procedure.
- `scripts/notify-exception.mjs` / `scripts/status-log.mjs` / `scripts/record-status-event.mjs`
  — the six-category notification-by-exception contract and the dashboard-ready
  `automation/status/events.jsonl` log for everything else.
- `scripts/queue-rules.mjs`'s `canDispatch()` now also suspends the entire queue (not just
  guide jobs) while any `site-incident` issue is open — extending, not replacing, issue #16's
  queue.

### Testing
```
node --test scripts/__tests__/*.test.mjs
node scripts/simulate-guide-factory.mjs
```

### Activation checklist (in addition to issue #16's)
1. Copy `docs/automation/workflows/guide-factory-dispatch.yml` and
   `docs/automation/workflows/deploy-health-check.yml` into `.github/workflows/` (same
   workflow-edit-permission constraint as issue #16 — Claude's GitHub App token cannot do
   this itself).
2. Run `node scripts/queue-labels.mjs` again (or once more via its workflow) to create the
   new `site-incident` label — it's already added to `LABEL_CONTRACT`.
3. Author a real, `approved` guide job manifest under `automation/guide-jobs/` once real,
   verified product/source facts exist for it — none ship in this change (see that
   directory's own `README.md` for why).

## Completion handoff watchdog (issue #22)

`docs/AUTOMATION_HANDOFF_WATCHDOG_V1.md` is the canonical spec for a repair/escalation loop
closing the exact silent-handoff gap seen on issues #16 and #17: an implementation run
finishes and pushes a branch, but nothing opens a PR, so the issue stays `in-progress`
indefinitely. Summary of what's implemented:

- `scripts/handoff-watchdog-rules.mjs`, `scripts/handoff-watchdog.mjs` — for every `in-progress`
  + `automation-managed` issue, discover its `claude/issue-<N>-*` branch; once 15 minutes pass
  with no PR opened, open one itself as a draft and move the issue to `review`; flag any staged
  workflow file under `docs/automation/workflows/` with one precise maintainer comment
  regardless of grace period or PR state; mark `automation-failed` + `needs-human` if a
  completed run has neither a usable branch nor a PR. Every action is idempotent (HTML-comment
  markers scanned from the issue's own comments) and logs a heartbeat/exception event to
  `automation/status/events.jsonl` via the existing `scripts/record-status-event.mjs`.
- `scripts/queue-github-client.mjs` gained the branch/PR/diff/create-PR calls the watchdog
  needs — no new secret, same `GITHUB_TOKEN`.
- `docs/automation/workflows/handoff-watchdog.yml` — staged, not active, same reason as every
  other workflow in this section. Runs every 5 minutes (tighter than the hourly dispatch
  cadence) because it only reads state and repairs/escalates — it never claims new work, so the
  "no more frequent than hourly" guidance for `dispatch-queue.yml` doesn't apply.

### Testing
```
node --test scripts/__tests__/handoff-watchdog-rules.test.mjs scripts/__tests__/handoff-watchdog.test.mjs
```
Deterministic, fixture-driven — includes regression fixtures reproducing #16 and #17's exact
branch/staged-file shapes.

### Activation checklist (in addition to issue #16/#17's)
1. Copy `docs/automation/workflows/handoff-watchdog.yml` into `.github/workflows/`.
2. Confirm `Settings → Actions → General → Workflow permissions` allows `issues: write` **and**
   `pull-requests: write` for the default `GITHUB_TOKEN` — `pull-requests: write` is new,
   needed to open the repair draft PR (every other staged workflow only needed
   `pull-requests: read`).
3. No new label required — reuses the existing label contract.

## OpenAI Images API renderer (issue #18)

`docs/OPENAI_IMAGE_RENDERER_V1.md` is the canonical spec for the OpenAI Images API provider
adapter, prompt compiler, hybrid (generative + deterministic) rendering architecture, reference
preservation/visual QA, asset pipeline, and cost/rate controls layered on top of the guide
factory (issue #17). Summary of what's implemented:

- `scripts/openai-image-provider.mjs` — fail-closed OpenAI Images API adapter; reads
  `OPENAI_API_KEY` from the environment only, never logs it.
- `scripts/openai-prompt-compiler.mjs`, `scripts/openai-cost-controls.mjs`,
  `scripts/reference-preservation-check.mjs`, `scripts/openai-asset-pipeline.mjs` — pure,
  unit-tested collaborators (prompt versioning, budget/attempt gating, conservative
  needs-human-by-default visual QA, asset naming/checksums).
- `scripts/openai-hybrid-renderer.mjs` — the async orchestration layer; produces the same
  `{ slideOrder, mode, format, status, content }` shape `scripts/guide-renderer-adapter.mjs`'s
  synchronous `renderSlides()` does, fed into `scripts/guide-factory.mjs`'s `runGuideFactoryJob`
  via its new, additive `precomputedRenderedAssets` parameter (default `null` — every existing
  caller/test is unaffected).
- `scripts/openai-renderer-cli.mjs` — the I/O boundary: env-only key, automatic simulate-mode
  fallback when no key is present, persists the spend ledger
  (`automation/status/openai-spend.jsonl`, same append-only pattern as `events.jsonl`).
- Proven end-to-end against an isolated fixture (never real site content, no real network call,
  $0 real spend) with `node scripts/simulate-openai-pilot.mjs`.

### Testing
```
node --test scripts/__tests__/*.test.mjs
node scripts/simulate-openai-pilot.mjs
```

### Activation checklist (in addition to issue #16/#17's)
1. Copy `docs/automation/workflows/openai-pilot-dispatch.yml` into `.github/workflows/` (same
   workflow-edit-permission constraint as every prior issue — Claude's GitHub App token cannot
   do this itself).
2. Confirm the `OPENAI_API_KEY` repository secret referenced in issue #18's own comment thread
   exists and is scoped to this workflow only.
3. Author a real, `approved` guide job manifest with `assets.rendererMode: 'openai-hybrid'`
   under `automation/guide-jobs/` once real, verified product/reference-image facts exist for
   it — none ship in this change, same reasoning as issue #17's guide manifests.
4. Leave the workflow's `simulate` input at its default (`true`) until a maintainer has reviewed
   at least one real `needs-human` (or `ready-for-pr`, once a vision-QA pass exists) result from
   a live run.

## Mission Control ops dashboard (issue #19)

`docs/OPS_DASHBOARD_V1.md` is the canonical spec for a read-only, mobile-first status
dashboard over everything above — queue depth, active issue/PR, CI, deployment health,
guide factory, OpenAI image renderer budget, and incident state. Summary of what's
implemented:

- `scripts/ops-status-schema.mjs`, `scripts/ops-status-builder.mjs` — pure, unit-tested
  schema (closed shape + secret-like-value scan) and status-document assembly. See
  `scripts/__tests__/ops-status-schema.test.mjs` / `ops-status-builder.test.mjs`.
- `scripts/ops-status-cli.mjs` — reads local automation artifacts plus (when
  `GITHUB_TOKEN` is available) live queue/CI state, and writes `ops/status.json` —
  refusing to write anything that fails schema or secret-scan validation first.
- `ops.dc.html` — the dashboard itself. `noindex, nofollow`, not linked from
  `Site Nav.dc.html`/`Site Footer.dc.html`, `robots.txt`-disallowed. Polls
  `ops/status.json` every 60 seconds and visually distinguishes stale data from a healthy
  idle state.
- `docs/automation/workflows/ops-status-refresh.yml` — staged, not active. Unlike every
  other staged workflow in this repo, it needs `contents: write` to commit the refreshed
  `ops/status.json` directly to `main` — see `docs/OPS_DASHBOARD_V1.md` "Why the status
  artifact is committed, not published some other way" before activating it.

### Testing
```
node --test scripts/__tests__/*.test.mjs
node scripts/ops-status-cli.mjs --dry-run
```

### Activation checklist (in addition to issue #16/#17/#18/#22's)
1. Read `docs/automation/workflows/ops-status-refresh.yml`'s header comment — it carries a
   different permission/trust shape (`contents: write`, direct-to-`main` commit) than every
   other staged workflow here.
2. Copy `docs/automation/workflows/ops-status-refresh.yml` into `.github/workflows/`.
3. No new label required.

## Mission Control v2 — live operations dashboard (issue #42, Phase 1 + 2)

`docs/OPS_DASHBOARD_V2.md` is the canonical spec. Extends the pattern above with a
multi-source, independently-stale-tracked live feed rather than one blended snapshot. v1
above stays active and unmodified; summary of what's implemented:

- `scripts/ops-live-schema.mjs`, `scripts/ops-live-builder.mjs` — pure, unit-tested schema
  and live-feed-document assembly, including per-source `live`/`delayed`/`offline` staleness,
  last-known-good fallback, and automation-feed merge-by-key. See
  `scripts/__tests__/ops-live-schema.test.mjs` / `ops-live-builder.test.mjs`.
- `scripts/ops-live-cli.mjs` — reads the previous `ops/live-feed.json` plus (when
  `GITHUB_TOKEN` is available) live engineering/deployment state via
  `scripts/queue-github-client.mjs`, and writes `ops/live-feed.json` — same
  refuse-on-failed-validation gate as `ops-status-cli.mjs`.
- `scripts/ops-live-refresh-state.mjs` — client polling/backoff/fallback-fetch helpers. See
  `scripts/__tests__/ops-live-refresh-state.test.mjs`.
- `mission-control.dc.html` — the v2 dashboard. `noindex, nofollow`, not linked from
  `Site Nav.dc.html`/`Site Footer.dc.html`, `robots.txt`-disallowed. Polls
  `ops/live-feed.json` every 45 seconds with exponential backoff on failure and a
  Live/Updating/Delayed/Offline header indicator.
- `docs/automation/workflows/ops-live-feed-refresh.yml` — staged, not active. Same
  `contents: write` trust shape as `ops-status-refresh.yml`, plus a new `deployments: read`
  permission for GitHub Pages deployment status — see `docs/OPS_DASHBOARD_V2.md` before
  activating it.

### Testing
```
node --test scripts/__tests__/*.test.mjs
node scripts/ops-live-cli.mjs --dry-run
```

### Activation checklist (in addition to issue #16/#17/#18/#19/#22's)
1. Read `docs/automation/workflows/ops-live-feed-refresh.yml`'s header comment — same
   `contents: write`, direct-to-`main` commit trust shape as `ops-status-refresh.yml`, running
   on its own 5-minute schedule alongside it.
2. Copy `docs/automation/workflows/ops-live-feed-refresh.yml` into `.github/workflows/`.
3. Confirm `Settings → Actions → General → Workflow permissions` allows `deployments: read`
   for the default `GITHUB_TOKEN` — new relative to issue #19's checklist.
4. No new label required.

## One-time GitHub repository settings required

- **Settings → Pages → Build and deployment → Source**: set to **GitHub Actions** (not "Deploy from a branch"). Without this, `.github/workflows/pages.yml` will fail at the `actions/deploy-pages` step with a permissions/configuration error.
- Optionally, **Settings → Actions → General → Workflow permissions**: confirm `id-token: write` and `pages: write` are permitted for the repo (default GitHub Pages-enabled repos already allow this; only relevant if the org has tightened default `GITHUB_TOKEN` permissions).
