# WearWyzer — Site incident & rollback runbook

Companion to `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` §4. This is the human-facing procedure
for responding to a `site-incident` issue opened by `scripts/deploy-health-check-cli.mjs`.

## What triggers a `site-incident`

Every push to `main` deploys automatically (`.github/workflows/pages.yml`). Once the
`deploy-health-check.yml` workflow (staged in `docs/automation/workflows/`, not yet active
— see its activation checklist) is copied in, it runs `scripts/deploy-health-check-cli.mjs`
against the deployed URL after every successful deploy. A route failing any of the
following opens the incident:

- non-2xx HTTP status
- missing `<title>` (a sign the page failed to render at all)
- a literal, unrendered `{{ field }}` binding in the response body — the dc-runtime's own
  "never resolved" signal, surviving into the HTML instead of being silently dropped
- the fetch itself failing (DNS, timeout, connection refused)

## What happens automatically

1. `site-incident` + `needs-human` labels are added to a new issue containing the concise
   incident report (`scripts/rollback.mjs` `buildIncidentReport()`): which routes failed and
   why, the deployed commit SHA, and the rollback plan.
2. **The automation queue is suspended.** `scripts/queue-rules.mjs`'s `canDispatch()` refuses
   to dispatch *any* work — engineering issue, site upgrade, or guide job — while any
   `site-incident` issue is open. This is checked before every other gate.
3. If a distinct last-known-healthy commit is on record
   (`automation/status/last-healthy-deploy.json`), the report includes the exact
   `git revert`/`gh pr create` commands to open a revert PR. **No commit is pushed and no PR
   is merged automatically** — a human always reviews and merges the revert.

## What a human does

1. Open the `site-incident` issue and read the report.
2. If a revert plan is included: run the listed commands (or have Claude run them), review
   the resulting revert PR's diff, and merge it once satisfied. This re-triggers the Pages
   deploy and, once the health check workflow re-runs clean, do step 4.
3. If no revert plan is included (`action: 'incident-only'` — no known-good commit is
   recorded, or the failure isn't isolated to one deploy): diagnose directly. Common causes:
   a broken `<dc-import>` reference, a `js/guides.js`/`js/products.js` edit that
   `scripts/validate-content-data.mjs` should have caught but didn't run in CI yet, or a
   GitHub Pages configuration issue (see `docs/AUTOMATION_WORKFLOW.md` "One-time GitHub
   repository settings required").
4. **Close the `site-incident` issue only once the deployed site is confirmed healthy** —
   either re-run `node scripts/deploy-health-check-cli.mjs --base-url <url> --sha <sha>`
   manually, or wait for the next scheduled health check to pass. Closing the issue is what
   un-suspends the queue; closing it prematurely lets automation resume against a still-
   broken site.

## Manual health check

```
node scripts/deploy-health-check-cli.mjs --base-url https://www.wearwyzer.com --sha $(git rev-parse HEAD) --dry-run
```

`--dry-run` prints the result without opening an issue or writing the healthy-deploy ledger
— safe to run any time to check current site health without side effects.

## Escalation

If the health check itself cannot run (e.g. a missing/expired `GITHUB_TOKEN`, or the deploy
workflow itself failing before any health check gets a chance to run), that is a
`missing-or-expired-credential` or `automation-blocked-after-retries` exception per
`docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` §6 — treat it exactly like a `site-incident` (diagnose
and resolve before resuming automated dispatch) even though no `site-incident` issue exists
to formally suspend the queue in that case.
