# Guide job queue

This directory holds the guide factory's job manifests — one `*.json`
file per candidate guide, validated against the schema in
`scripts/guide-manifest-schema.mjs` and processed by
`scripts/guide-factory-cli.mjs`. See `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md`
for the full manifest contract and pipeline.

## Lifecycle

`draft` → `approved` → `in-progress` → `ready-for-pr` / `needs-human` → `published`

- A human editor authors a manifest as `draft` and moves it to `approved`
  only once every source URL is real and verified, every product
  reference resolves, and every fact is honest (no invented price,
  affiliate link, or availability claim — see `CLAUDE.md`).
- `scripts/guide-factory-cli.mjs` claims at most one `approved` job per
  run (single-flight, same rule as the engineering queue in
  `docs/AUTONOMOUS_ENGINEERING_V1.md`), sets it `in-progress`, and either
  produces a `ready-for-pr` result or rewrites the file's `status` to
  `needs-human` with the blocking reasons left in the automation's
  status log (`automation/status/events.jsonl`) — it never guesses.

## No real jobs ship in this change

This directory is intentionally empty of real, `approved` manifests as
of issue #17. Authoring a real one requires real, verified product
facts and source URLs this environment has no way to confirm — inventing
one to "prove out" the pipeline on the live site would violate
`CLAUDE.md`'s content-integrity rule. The pipeline is instead proven
end-to-end against an isolated fixture (`scripts/__fixtures__/guide-jobs.mjs`,
run via `node scripts/simulate-guide-factory.mjs`) — see that doc's
"Why no fixture guide was published to the live site" section.
