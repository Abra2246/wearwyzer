# Automation status log

`events.jsonl` (created on first write by `scripts/record-status-event.mjs`)
is the machine-readable, dashboard-ready event log issue #17 section 6
requires: one JSON object per line, `{ timestampIso, kind, type, summary,
outcome, detail }`. `kind` is `"routine"` (logged only, never an
interruptive alert) or `"exception"` (see `scripts/notify-exception.mjs`
for the six categories that count as an exception).

`last-healthy-deploy.json` (created on first successful health check by
`scripts/deploy-health-check-cli.mjs`) records the last commit SHA that
passed the post-deploy health check — the rollback planner
(`scripts/rollback.mjs`) uses it to know what a safe revert target is.

`openai-spend.jsonl` (created on first write by `scripts/openai-spend-ledger.mjs`,
via `scripts/openai-renderer-cli.mjs`) is the append-only spend ledger issue #18
section 6 requires: one JSON object per line, `{ guideId, timestampIso, costUsd,
accepted, stage, slideOrder }`. `scripts/openai-cost-controls.mjs`'s
`evaluateBudget`/`evaluateAttempt` read it to enforce the per-guide and monthly
spend caps before any generation call is made.

`link-engine-report.json` (created on every run of `scripts/link-engine-cli.mjs`,
issue #24) is a full-overwrite snapshot — not append-only — of the verified
supporting-item link engine's last run: portfolio and per-guide affiliate
coverage against the 80–90% target, logged threshold shortfalls, guides flagged
as a recurring sourcing priority, and `needsHumanCount`/`brokenCount` totals.
`scripts/ops-status-builder.mjs`'s `buildLinkEngine()` reads it (when present)
to populate the dashboard's `linkEngine` section. See `docs/LINK_ENGINE_V1.md`.

## Reading the log

```
node scripts/record-status-event.mjs digest
```

prints a daily-digest-style markdown summary (`scripts/status-log.mjs`
`summarizeDaily`/`renderDailyDigestMarkdown`) — counts by type, plus every
exception event verbatim. No dependencies, no network access.

All four files are automation-generated and intentionally start absent from
version control in this change; they are populated the first time the
corresponding CLI runs against a real deployment (or, for `openai-spend.jsonl`,
a real non-dry-run OpenAI renderer job; or, for `link-engine-report.json`, any
non-dry-run `scripts/link-engine-cli.mjs` run — including a local one against
this repo's real Knowledge Graph, which is safe to run any time since no
adapter in this repository is ever live).
