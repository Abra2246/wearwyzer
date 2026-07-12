# Automation workflow

This document describes the issue-driven engineering workflow this repo is set up for, what's already wired up, and what's intentionally deferred.

## Intended workflow

```
GitHub issue → Claude implementation → branch → tests → PR → preview → review → merge
```

1. **GitHub issue** — Every engineering task starts as an issue using the [`Engineering task`](../.github/ISSUE_TEMPLATE/engineering-task.yml) template. It forces the objective, source specification, scope, exclusions, acceptance criteria, validation requirements, risk tier, and whether automatic implementation is allowed to be stated up front — the same information an agent (or a human) needs to avoid the scope-creep and unverified-claim failures already catalogued in `CHANGELOG.md` (e.g. the Guide #3 controller shipping blank, or the `productId` mismatches).
2. **Claude implementation** — For issues marked "automatic implementation allowed," Claude (or another engineer) implements the change on a new branch, following `CLAUDE.md`, `CONTRIBUTING.md`, and this repo's content-integrity rules.
3. **Branch** — One branch per issue, named for the change (e.g. `chore/preview-and-automation-foundation`).
4. **Tests** — `node scripts/validate-content-data.mjs` for any `js/guides.js`/`js/products.js` change, plus manual verification via `./scripts/preview.sh` (see [README.md](../README.md) and `DEVELOPMENT.md`) — this repo has no automated test suite, so a loaded page with a clean console is the actual bar for "done" per `CLAUDE.md`.
5. **PR** — Opened using [`.github/pull_request_template.md`](../.github/pull_request_template.md), which links back to the issue and re-states scope, validation, and risk tier so a reviewer can check the PR against what was actually approved in the issue.
6. **Preview** — Every push to `main` deploys automatically to GitHub Pages (`.github/workflows/pages.yml`); PR branches can be checked locally with `./scripts/preview.sh` before merge (GitHub Pages previews are configured for `main` only in this milestone — see "Next integration step" below for branch/PR previews).
7. **Review** — A human (Abraham, or whoever owns the risk tier for that change) reviews the PR against its linked issue's acceptance criteria before merging.
8. **Merge** — Squash or merge per the reviewer's normal preference; merging to `main` triggers the Pages deploy.

## What's wired up today

- `.github/ISSUE_TEMPLATE/engineering-task.yml` — the structured issue form described above.
- `.github/pull_request_template.md` — the PR checklist described above.
- `.github/workflows/content-validation.yml` — existing CI, runs `scripts/validate-content-data.mjs` on every PR and push to `main`. Unchanged by this work.
- `.github/workflows/pages.yml` — new. Runs the same content validator, then deploys the repository to GitHub Pages on every push to `main` (or manually via `workflow_dispatch`).
- `scripts/preview.sh` — local, dependency-free preview server for manual verification before opening a PR.

## What's deferred: an AI GitHub Action

This workflow does **not** yet install an AI GitHub Action (e.g. one that lets Claude respond to issues/PR comments directly inside GitHub) or configure an API key/secret for one. That's the natural next integration step once this foundation is reviewed, but it requires:
- Abraham's authorization to install a GitHub App / Action into the repo (an account-level decision, not something to do unilaterally from an issue).
- Generating and storing an Anthropic API key as a repository or environment secret, scoped appropriately (e.g. restricted to a `claude-automation` environment requiring approval for high-risk-tier issues).
- Deciding which risk tiers (see the issue template) are eligible for the Action to open PRs against unattended, versus requiring a human to kick off implementation manually (as this milestone's workflow assumes).

Until that's set up, "Claude implementation" in the workflow above means: a human pastes the issue into a Claude Code session (as happened for this task) and drives it through the branch/PR steps manually.

## One-time GitHub repository settings required

- **Settings → Pages → Build and deployment → Source**: set to **GitHub Actions** (not "Deploy from a branch"). Without this, `.github/workflows/pages.yml` will fail at the `actions/deploy-pages` step with a permissions/configuration error.
- Optionally, **Settings → Actions → General → Workflow permissions**: confirm `id-token: write` and `pages: write` are permitted for the repo (default GitHub Pages-enabled repos already allow this; only relevant if the org has tightened default `GITHUB_TOKEN` permissions).
