# WearWyzer Mission Control v2 — live operations dashboard (issue #42)

## Problem

`docs/OPS_DASHBOARD_V1.md` shipped a real, working dashboard, but it is
**snapshot-first**: one blended `overallHealth` (green/yellow/red) computed
from a single `generatedAtIso`, refreshed on a 15-minute schedule. That
conflates two different questions — "is the underlying system healthy?" and
"is this specific field's data still trustworthy right now?" — into one
number, which is exactly how a stale snapshot can read as "green" days after
the generator stopped running. Issue #42 asks for a dashboard that answers
"is everything okay right now?" from data that **queries current system
state wherever safely possible**, with explicit unknown/delayed/offline
states instead of ever showing fake green, and a business-readable timeline
of what automation actually did.

## Constraint this has to work within

This repo is still front-end-only, no backend, no build step, no package
manager (`CLAUDE.md`). A browser cannot safely hold a GitHub token (issue
#42's own product principle: "never expose secrets... or unrestricted write
controls"), and unauthenticated browser-side GitHub API calls are rate
limited to 60 requests/hour per IP — nowhere near enough for a dashboard
that polls every 30-60 seconds. The issue names two acceptable shapes for a
secure aggregation layer: a GitHub Actions-generated compact live feed, or a
least-privilege serverless endpoint with caching.

**Decision: extend v1's existing pattern rather than build a serverless
endpoint.** `ops-status-refresh.yml` already proved out exactly the "GitHub
Actions-generated compact live feed" shape end-to-end: a scheduled workflow
with a scoped `GITHUB_TOKEN` calls the GitHub API server-side, a pure
builder assembles a sanitized document, a closed-shape schema plus a
secret-value scanner gate what's allowed to reach disk, and the committed
JSON is what the static, unauthenticated dashboard actually fetches. A
serverless endpoint would introduce a new deployment target, a new secret
store, and a new failure mode (the function itself going down) for a
capability this repo already has working. The tradeoff is the same one v1
already accepted and documented: freshness is bounded by how often the
generator runs (now 5 minutes, GitHub Actions' tightest schedule
granularity — see `docs/automation/workflows/ops-live-feed-refresh.yml`),
not truly "live" in the request-time sense. That is what the explicit
Live/Delayed/Offline model below is for: the dashboard never claims data is
fresher than it actually is.

## What changed from v1's model

v1's `ops/status.json` is one document with one `generatedAtIso` and one
`overallHealth`. v2's `ops/live-feed.json` is a **multi-source** document:
every source that's actually wired (`engineering`, `deployment` in this
Phase 2 slice) carries its own `state` (`live` | `delayed` | `offline`)
derived from **how long ago that specific source was last successfully
queried** — not from how interesting its data is, and not from one shared
clock.

### Per-source freshness vs. event recency

These are deliberately different numbers. A quiet deployment (no new commit
in three days) is healthy, not stale — `deployment.state` should stay `live`
as long as the generator can still successfully *ask* GitHub Pages "what's
the latest deployment status" every 5 minutes, regardless of how long ago
that deployment happened. `deployment.data.lastDeployIso` /
`.ageMinutes` separately report when the underlying event happened, purely
as information, and never feed into `deployment.state`. Conflating these two
would either falsely show "stale" during a genuinely quiet period, or
falsely show "live" when the generator has actually lost the ability to
check GitHub at all — both violate "no fake green."

### Last-known-good, explicitly labeled

When a generator run's GitHub API call fails, the source's `data` is carried
forward unchanged from the previous committed `ops/live-feed.json` (issue
#42: "preserve a last-known-good state while clearly labeling it stale").
`lastUpdatedIso` does **not** advance on a failed fetch, so the source's
`state` ages from `live` → `delayed` → `offline` as the outage continues,
purely as a function of time — the dashboard shows real data with
increasingly urgent staleness framing, never a blank screen and never a
silently-frozen "healthy" badge. See `buildSource()` in
`scripts/ops-live-builder.mjs`.

### "No fake green" aggregation

`overallState` is the worst of the two **critical** sources
(`engineering`, `deployment`) only — `offline` beats `delayed` beats `live`.
Not-wired Phase 3 sources (`content`, `image`, `affiliate`) never affect it;
they report their own honest `not-wired` state instead of being silently
omitted or defaulted to something that looks healthy. See
`aggregateOverallState()`.

## Data contract

Canonical, enforced shape: `scripts/ops-live-schema.mjs` (closed — every
nested object rejects unknown keys, mirroring
`scripts/ops-status-schema.mjs`'s approach). Summary:

```
LiveFeedDocument {
  schemaVersion: 1
  generatedAtIso: string                 // when this generator run happened
  overallState: 'live' | 'delayed' | 'offline'
  ceo: {
    headline: string                     // one-line "is everything ok"
    requiredAction: string | null        // the single most urgent thing, or null
    activeWorkSummary: string | null
  }
  sources: {
    engineering: WiredSource<EngineeringData>
    deployment: WiredSource<DeploymentData>
    content:   NotWiredSource            // Phase 3
    image:     NotWiredSource            // Phase 3
    affiliate: NotWiredSource            // Phase 3
  }
  automationFeed: FeedEvent[]            // newest-first, capped at 50
}

WiredSource<T> {
  wired: true
  state: 'live' | 'delayed' | 'offline'
  lastUpdatedIso: string | null          // when this source was last *successfully* queried
  fetchOk: boolean                       // did *this run's* query succeed
  data: T | null
  note: null
}

NotWiredSource {
  wired: false
  state: 'not-wired'
  lastUpdatedIso: null
  fetchOk: false
  data: null
  note: string                          // why, and which phase wires it
}

EngineeringData {
  automationState: 'working' | 'queued' | 'review' | 'blocked' | 'failed' | 'idle'  // same enum as v1
  activeIssue: { number, title, url, updatedIso } | null
  queue: { depth, readyCount, blockedCount, stalledSinceIso }
  pr: { number, title, url, isDraft, reviewDecision, mergeableState, createdIso, updatedIso } | null
  ci: { status: 'passing'|'failing'|'unknown', latestRunIso, latestRunUrl, recentFailureCount }
  handoff: { stalled: boolean, reason: string | null }
}

DeploymentData {
  status: 'healthy' | 'failing' | 'unknown'
  lastHealthyShaShort: string | null
  lastDeployIso: string | null
  ageMinutes: number | null
  pagesUrl: string | null
}

FeedEvent {
  key: string        // stable, idempotency key — see "Automation feed" below
  timestampIso: string
  type: string        // e.g. issue-started, pr-opened, pr-merged, ci-passed, ci-failed, deployed
  summary: string      // short, human-readable, already truncated
  url: string | null
}
```

## Automation feed: merge-by-key, not diff-by-state

The feed is assembled from two sources every generator run:

1. `automation/status/events.jsonl` (`scripts/record-status-event.mjs`) —
   already-real business-readable events this repo's automation logs today
   (deploy health, guide factory, handoff watchdog, image renderer).
2. Freshly observed GitHub state this same run gathered: the active issue,
   its linked PR, completed CI runs, recently merged PRs, and the latest
   Pages deployment (`feedEventsFromGitHubState()` in
   `scripts/ops-live-builder.mjs`).

Each candidate event carries a **stable key** derived from the underlying
resource, never from the run that observed it — `issue-started:<number>`,
`pr-opened:<number>`, `pr-merged:<number>`, `ci-run:<runId>`,
`deploy:<sha>`, `log:<timestampIso>:<type>`. `mergeAutomationFeed()` unions
this run's candidates with the previous commit's feed by key, keeping
whichever copy already existed, sorts newest-first, and caps at 50. This
makes the feed **idempotent by construction**: the same CI run or merged PR
appears exactly once no matter how many 5-minute generator runs observe it,
without the generator needing to diff "what changed since last time" as a
separate step. It also means feed history genuinely accumulates across runs
rather than resetting — the previous committed document is always an input.

## Health aggregation, staleness, and handoff detection

- `computeSourceState(lastUpdatedIso, { now, staleAfterMinutes,
  offlineAfterMinutes })` — pure function, per-source thresholds
  (`DEFAULT_THRESHOLDS` in `scripts/ops-live-schema.mjs`): engineering
  10m/45m, deployment 15m/60m (looser, since Pages deployment status
  changes less often and a 5-minute generator hiccup shouldn't immediately
  read as delayed).
- `detectStalledHandoff()` — a lightweight version of issue #22's full
  watchdog (`scripts/handoff-watchdog-rules.mjs`), reusing that module's own
  `GRACE_PERIOD_MINUTES` constant and `minutesBetween()` helper rather than
  re-deriving them. Unlike the full watchdog, this doesn't fetch branch/PR
  diff data of its own — it works entirely off what the engineering source
  already gathered (active issue + whether a PR exists), which is enough to
  **show** a stall on the dashboard without duplicating the watchdog's own
  repair/escalate side effects. The full watchdog remains the system that
  actually repairs a stalled handoff; this only surfaces it.
- `buildCeoSummary()` — fixed precedence, most urgent first: a source itself
  being offline (we don't know current state) outranks anything it might
  otherwise report; then a stalled handoff; then blocked/failed automation;
  then a failing deployment; then failing CI; then "delayed but otherwise
  fine"; otherwise a plain healthy headline with `requiredAction: null`.

## P0 repair (2026-07-18): false-green client bug, generator heartbeat, stalled dispatch

The first activation of `ops-live-feed-refresh.yml` exposed two problems Phase 1+2 hadn't hit
yet, since no run had ever succeeded or gone stale in production before:

1. **The workflow's commit-and-push step had no retry.** It ran on both a 5-minute schedule and
   every push to `main`, so a same-second collision with another workflow that also commits
   straight to `main` (`ops-status-refresh.yml`, triggered by the same push) was inevitable, not
   exceptional — and a bare `git push` rejects outright the instant anything else lands first.
   Its first-ever run hit exactly this and failed, leaving `ops/live-feed.json` frozen at
   `2026-07-14T20:29:58Z`. Fixed by retrying (up to 5 times) on push rejection — re-syncing to the
   new `origin/main` tip and **regenerating** the feed fresh each time, not rebasing the stale
   commit, since the whole point of this file is "current state."
2. **The dashboard trusted embedded state strings, not elapsed time.** `mission-control.dc.html`
   read `doc.overallState` / `source.state` directly from the fetched JSON. Those strings are
   computed once, at generator-run time — a committed file is a static snapshot. A browser
   fetching that same file successfully days after the generator stopped running got a real HTTP
   200 and the same baked-in `"live"`, which is exactly the false-green bug: `ops/live-feed.json`
   read `overallState: "live"` for 4 days straight while stamped 4 days stale. Fixed by
   `applyClientFreshness()` in `scripts/ops-live-refresh-state.mjs`, which every render
   recomputes each critical source's state (and the overall state) from `lastUpdatedIso` against
   the *browser's* current time, using the same `computeSourceState` thresholds and worst-of rule
   the generator itself uses. A successful fetch of stale data now reads `Delayed`/`Offline`,
   never `Live` — "no fake green" enforced at the transport layer, not just at generation time.

This also adds two requirements issue #42 called out that Phase 1+2 hadn't implemented yet:

- **Generator heartbeat.** The CEO card now shows "Generator last ran: {relative age}" from
  `doc.generatedAtIso`, distinct from the pre-existing "this device last checked" line (which is
  this browser's own last successful *poll*, not the generator's last successful *run* — those
  are different clocks and were previously conflated under one "Last successful update" label).
- **Stalled dispatch.** `computeDispatchStalledSince()` / `detectStalledDispatch()` in
  `scripts/ops-live-builder.mjs` detect "queue depth > 0 with no active issue, beyond an SLA"
  (`DISPATCH_SLA_MINUTES = 90`, one missed cycle of `dispatch-queue.yml`'s hourly cron). Since
  queue depth has no natural "since when" timestamp the way an issue does, the start of the
  stalled condition (`EngineeringData.queue.stalledSinceIso`) is carried forward across committed
  `ops/live-feed.json` runs the same way last-known-good source data already is, and reset to
  `null` the instant the condition stops being true. Surfaced through the same `handoff`
  `{stalled, reason}` slot a stuck working-issue-with-no-PR handoff already used — the two never
  fire simultaneously, since `automationState` can't be both `working` and `queued` — with its
  own CEO headline ("Queued work is not being dispatched.") so it isn't mistaken for the other
  case.

## Client: polling, Live/Updating/Delayed/Offline, and backoff

`scripts/ops-live-refresh-state.mjs` (pure except the injected `fetchImpl`,
same split as v1's `scripts/ops-refresh-state.mjs`):

- Polls every 45 seconds (issue #42's "30-60 seconds"), preferring
  `raw.githubusercontent.com/.../main/ops/live-feed.json` over the
  Pages-deployed copy, with the Pages copy as fallback — identical reasoning
  to v1's fetch strategy (`ops-refresh-state.mjs`'s own header comment: the
  Pages deploy can lag the committed file by a further deploy cycle).
- On a failed fetch, retries with exponential backoff
  (`computeBackoffDelayMs`: 45s, 90s, 180s, capped at 5 minutes) instead of
  hammering a possibly-rate-limited or down endpoint.
- The header indicator is **not** just poll connectivity — `mission-control.dc.html`'s
  controller combines `isFetching` / `consecutiveFailures` (client-side, this
  device's own connection) with the fetched document's `overallState`
  (server-side, the underlying sources' freshness) into one of
  `Live` / `Updating…` / `Delayed` / `Offline`. A successful poll of a
  document that itself reports `overallState: 'delayed'` must show
  `Delayed`, not `Live` — the same "no fake green" rule applied one layer up,
  at the transport level.
- After `MAX_CONSECUTIVE_FAILURES_BEFORE_OFFLINE` (4) consecutive failures,
  the indicator reports `Offline` outright rather than backing off forever
  while still claiming to be "reconnecting."

## What shipped in this change (Phase 1 + Phase 2)

- `scripts/ops-live-schema.mjs` — the contract above, `validateLiveFeedShape()`,
  `computeSourceState()`. Reuses `findSecretLikeValues()` from
  `scripts/ops-status-schema.mjs` rather than duplicating the credential-scan
  patterns.
- `scripts/ops-live-builder.mjs` — pure assembly: `buildSource`,
  `buildNotWiredSource`, `aggregateOverallState`, `detectStalledHandoff`,
  `buildCeoSummary`, `mergeAutomationFeed`, `feedEventsFromStatusLog`,
  `feedEventsFromGitHubState`, `buildLiveFeed`. No I/O.
- `scripts/ops-live-cli.mjs` — the only file that touches disk or network.
  Reads the previous `ops/live-feed.json` (last-known-good), the local
  status-log, and (when `GITHUB_TOKEN`/`GITHUB_REPOSITORY` are set) live
  GitHub engineering + deployment state via
  `scripts/queue-github-client.mjs` (which gained
  `getPullRequestReviewDecision`, `listRecentlyMergedPullRequests`,
  `listRecentWorkflowRuns`, `getLatestPagesDeployment` — no new secret, same
  `GITHUB_TOKEN`). Refuses to write `ops/live-feed.json` if the assembled
  document fails `validateLiveFeedShape()` or turns up anything in
  `findSecretLikeValues()`, exactly like `ops-status-cli.mjs`.
- `scripts/ops-live-refresh-state.mjs` — client polling/backoff/fallback-fetch
  helpers, importable both by `mission-control.dc.html` and by
  `node:test`.
- `mission-control.dc.html` — the v2 dashboard: header Live/Updating/Delayed/Offline
  indicator, CEO summary card, Engineering and Deployment source cards
  (state pill, click-through links to the real issue/PR/CI run/live site),
  honest "Not wired" cards for Content/Image/Affiliate (Phase 3), and the
  automation feed timeline. Mobile-first single-column layout, same visual
  language as `ops.dc.html` (cream/ink/accent palette, Oswald display type,
  inline styles only — `CLAUDE.md`). `noindex, nofollow` +
  `robots.txt` disallow, unlinked from nav — same non-access-control-but-defense-in-depth
  posture as v1 (`docs/OPS_DASHBOARD_V1.md` "Limitations of unauthenticated
  static hosting" applies identically here).
- `ops/live-feed.json` — a real, committed initial snapshot (generated by
  running the CLI once against this repo's actual live state), same
  seeding approach v1 used for `ops/status.json`.
- `docs/automation/workflows/ops-live-feed-refresh.yml` — staged, not
  active (Claude's GitHub App token cannot write to `.github/workflows/`).
  Runs every 5 minutes plus on every push to `main` plus
  `workflow_dispatch`.

**v1 is untouched.** `ops.dc.html`, `ops/status.json`,
`ops-status-refresh.yml`, and every file under `scripts/ops-status-*.mjs`
are unmodified by this change, per issue #42's own product principle
("Keep the current v1 dashboard operational until v2 proves reliable").
`mission-control.dc.html` links to `ops.dc.html` in its footer for easy
side-by-side comparison during the trial period.

## What's deliberately deferred to Phase 3+

- `content` (Guide Factory stage/queue), `image` (renderer spend/failures),
  `affiliate` (link-engine coverage/broken links) sources — all three exist
  as real data already (`ops/status.json`'s `guideFactory`/`imageRenderer`/
  `linkEngine` fields), but issue #42 scopes wiring them into the *live*,
  independently-stale-tracked model to Phase 3. Wiring them now would mean
  either re-deriving freshness semantics for three more sources without the
  Phase 3 design conversation the issue explicitly calls for, or silently
  reusing v1's single-clock semantics under a v2 label — both worse than an
  honest `not-wired` card.
- CEO summary polish and dedicated mobile QA pass beyond "loads correctly
  and shows real content at a 375px viewport" — Phase 4.
- A true PWA (manifest, service worker) — out of scope for both v1 and v2;
  see v1's own "Known v1 simplifications" for why offline caching would
  actively fight staleness detection.

## Local / unauthenticated runs

Running `node scripts/ops-live-cli.mjs` without `GITHUB_TOKEN`/`GITHUB_REPOSITORY`
set still produces a valid, schema-conformant document: both critical
sources report `fetchOk: false` and degrade to whatever last-known-good they
find in the existing `ops/live-feed.json` (or `offline` with `data: null` on
a first-ever run with no prior file). `overallState` becomes `offline` in
that case — expected, not a bug, for a local dry run with no token.

## Testing

```
node --test scripts/__tests__/ops-live-schema.test.mjs scripts/__tests__/ops-live-builder.test.mjs scripts/__tests__/ops-live-refresh-state.test.mjs
node --test scripts/__tests__/*.test.mjs   # full suite, confirms no regression (v1 untouched)
node scripts/ops-live-cli.mjs --dry-run    # prints a generated live-feed document without writing
node scripts/qa-static-site.mjs            # confirms mission-control.dc.html's local references resolve
```

Test coverage matches issue #42's explicit ask: health aggregation
(`aggregateOverallState`, "no fake green" precedence), stale-source handling
(`computeSourceState` boundaries, `buildSource` last-known-good fallback),
event timeline ordering (`mergeAutomationFeed` dedup/sort/cap), and
fallback/offline behavior (`buildLiveFeed` end-to-end fixtures for
first-run-offline and degraded-but-not-blank scenarios; `fetchLiveFeed`'s
main/Pages-fallback and both-fail cases).

Manual verification (this repo has no headless-browser CI step — see
`CLAUDE.md` "Verifying a change"): serve the repo with `./scripts/preview.sh`,
open `/mission-control.dc.html`, and confirm the dashboard renders with no
`[dc-runtime]` unresolved-binding console warnings at both a mobile (~375px)
and desktop viewport width, that the header indicator and CEO card reflect
`ops/live-feed.json`'s real content, that every Engineering/Deployment
click-through link resolves to the real GitHub resource, and that
`ops.dc.html` (v1) still renders unaffected.

## Activation checklist (in addition to issue #19's)

1. Read `docs/automation/workflows/ops-live-feed-refresh.yml`'s header
   comment and confirm you're comfortable running it **alongside**
   `ops-status-refresh.yml` (both commit to `main` on their own schedules;
   they touch different files and cannot conflict, but both carry the same
   `contents: write` trust exception).
2. Copy `docs/automation/workflows/ops-live-feed-refresh.yml` into
   `.github/workflows/` (same workflow-edit-permission constraint as every
   other staged workflow).
3. Confirm `Settings → Actions → General → Workflow permissions` allows
   `deployments: read` for the default `GITHUB_TOKEN` — new relative to
   issue #19's checklist, needed for `getLatestPagesDeployment()`.
4. No new label is required.
5. Once active, confirm `mission-control.dc.html` on the live Pages
   deployment shows real (not just locally-generated) data after the first
   scheduled run, and that the header indicator reads `Live`.
