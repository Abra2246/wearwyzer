# WearWyzer — Verified Supporting-Item Link Engine v1 (issue #24)

Companion to `docs/KNOWLEDGE_GRAPH_V1.md` (the Product/Offer/Retailer entity model this
engine's output is shaped to match) and `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` (§5's
`reportAffiliateCoverage()`, which this issue supersedes with a real, verified,
per-guide-and-portfolio coverage calculation instead of a "has *a* link, yes/no" count).
This document is the canonical spec for everything issue #24 scopes: the adapter
contract, matching/scoring, offer verification, coverage/threshold calculation,
scheduled revalidation, and the Mission Control integration.

## Operating principle

The engine either resolves a supporting item to a **verified** offer (exact match, or a
clearly labeled **alternative** when the exact item is confirmed unavailable) or marks it
`needs-human` with concrete evidence. There is no third path. Nothing is ever fabricated:
no invented price, retailer, availability, affiliate eligibility, or URL — every commerce
fact this engine returns is either a live, adapter-verified observation with a timestamp,
or explicitly absent.

## Scope note: an additive Knowledge Graph exception, not Recommendation 4

`ROADMAP.md` sequences the full "Affiliate Engine" (Recommendation 4 in `ARCHITECTURE.md`:
a real `retailers`/`offers` backend, a `/go/:offerId` click-tracking redirect, revenue
attribution) behind Milestone 3 (a real database + API), which does not exist in this
repository. Issue #24 does not attempt to skip that sequencing — this is the same kind of
deliberate, narrowly-scoped exception `ARCHITECTURE.md`'s "Decision — Hero Product page"
entry describes for issue #14: a real, working pipeline built entirely on the additive,
backend-free Knowledge Graph (`data/*.js`, issue #12) and deterministic in-memory
fixtures, with **no backend, no database, no live credential, and no wiring into any
`.dc.html` page**. It proves the matching/verification/coverage logic end to end so that
Milestone 5's eventual real backend has a tested algorithm to sit behind, rather than
designing one from scratch once a database exists.

## 1. Adapter layer (`scripts/link-engine-adapters.mjs`)

Every source of candidate listings — a brand's own site, a retailer, an affiliate
network, or a product feed — implements the same shape, so the pipeline never hard-codes
a provider:

```
{
  id, kind: 'brand-site'|'retailer'|'affiliate-network'|'product-feed', name, mode,
  async search(query): candidate[],
  async verify(listingId): candidate | null,
}
```

Two adapter modes ship in this version:

- **`fixture`** (`createFixtureAdapter`) — deterministic, in-memory, no network. This is
  the only mode this repository's tests, simulation, and CLI runs against real Knowledge
  Graph data actually exercise, per the issue's "deterministic fixtures first so no live
  affiliate credentials are required" instruction.
- **`http-provider`** (`createHttpProviderAdapter`) — the extension point a future real
  integration would implement. Permanently inert in this repository: `readAdapterCredentialFromEnv()`
  only ever reads `process.env.LINK_ENGINE_CREDENTIAL_<ADAPTER_ID>`, no credential is ever
  committed here, and every call fails closed with a structured `{ blocked: true,
  errorType, reason }` result — never throws, never fabricates a listing. Same
  inert-until-configured pattern as `scripts/openai-image-provider.mjs` and
  `scripts/guide-renderer-adapter.mjs`'s external-provider path.

A candidate/listing record always carries `canonicalUrl`, `retailerUrl`, and
`affiliateUrl` as three distinct, independently-nullable fields — a brand-direct listing
commonly has a canonical/retailer URL and no affiliate program at all; this module never
lets one field stand in for another.

## 2. Matching and confidence scoring (`scripts/link-engine-matcher.mjs`)

`scoreCandidate()` weighs canonical identifier (0.30), brand (0.25), name-token overlap
(0.25), category (0.10), color (0.06), and material (0.04) against the intended item, with
an exact canonical-id match forced to a perfect score regardless of noisy title text, and
a gender/audience mismatch zeroing the score outright (never silently substituted across
audiences).

`matchCandidates()` classifies every candidate set:
- **`exact`**: top score ≥ `EXACT_MATCH_THRESHOLD` (0.82) **and** separated from the
  runner-up by ≥ `AMBIGUITY_MARGIN` (0.06).
- **`ambiguous`**: something cleared `AMBIGUOUS_MATCH_FLOOR` (0.55) but the top result
  isn't confidently disambiguated — the ranked evidence (up to 5 candidates with scores)
  is attached to the `needs-human` result, never silently auto-picked.
- **`no-match`**: nothing cleared the floor.

## 3. Offer verification (`scripts/link-engine-verifier.mjs`)

`verifyOffer()` turns one adapter listing snapshot into a `linkStatus` (`live`, `dead`,
`redirected`, `out-of-stock`, `mismatched`, or `unavailable` for a delisted/not-found
listing) plus every commerce fact (`price`, `currency`, `stock`, `affiliateEligible`) and
all three URL fields, timestamped with `verifiedAtIso` — price/availability are always a
timestamped observation, never a permanent claim (`CLAUDE.md`'s fabrication rule).

Identity-drift detection (a listing whose title/brand no longer resembles the intended
item — `linkStatus: 'mismatched'`) only applies when the listing is supposed to *be* the
intended item. `scripts/link-engine.mjs` passes `allowLooseIdentity: true` when verifying a
deliberately-approved **alternative** (same category/gender/price tier, different product
by design) so a legitimately different substitute is never wrongly flagged as drift.

`isCoverageEligibleOffer()` — the single gate every coverage/dashboard number is built
from — requires `linkStatus === 'live'` **and** `affiliateEligible === true` **and** a
real `affiliateUrl`. `isStale()` flags a stored record due for recheck (`DEFAULT_MAX_STALE_DAYS`
= 14).

## 4. Pipeline orchestration (`scripts/link-engine.mjs`)

`resolveSupportingItem(intendedItem, adapters, { now })`:
1. Gather candidates from every adapter's `search()` (an inert `http-provider` adapter's
   `{ blocked: true }` result contributes zero candidates — never an error, never a
   fabricated one).
2. `matchCandidates()`. Anything but `exact` → `needs-human` immediately, with the ranked
   evidence attached (`reason: 'ambiguous-match'` or `'no-candidate-found'`).
3. Verify the exact candidate. If `linkStatus === 'live'` → `outcome: 'verified', type: 'exact'` —
   done, whether or not it happens to be affiliate-eligible (a live brand-direct link with
   no affiliate program is still a legitimate, correctly-labeled resolution, just not
   coverage-eligible).
4. Otherwise (dead/redirected/mismatched/out-of-stock/unavailable), search for an
   **approved alternative**: same category, same gender (if the intended item specifies
   one), same price tier. Alternative eligibility is that structural fit, *not* an
   identity-match score — an alternative is by definition a different product. The
   best-fitting approved candidate (ranked by score for tie-breaking only) is verified with
   `allowLooseIdentity: true`. If it verifies live → `outcome: 'verified', type: 'alternative'`,
   with `originalItemStatus` recording why the substitution happened. If no approved
   alternative exists, or the alternative also fails verification → `needs-human` with both
   items' evidence attached. Exact and alternative offers are never conflated: `type` is
   always present and checked by every downstream consumer (coverage, dashboard).

`detectDuplicateOffers()` flags when two distinct outfit items resolve to the exact same
listing — a data-quality signal (e.g. two outfit slots both pointing at the same retailer
SKU), reporting-only.

### Scheduled revalidation

`revalidateOfferRecords(storedOffers, adapters, { now, isStaleCheck, force })` re-checks
every stored offer that's due (`isStaleCheck`, or every record if `force: true`) and
classifies the outcome (`classifyRevalidationAction`):
- `dead`/`unavailable` → **removed**.
- `redirected`/`mismatched`/`out-of-stock`, or still-live-but-no-longer-affiliate-eligible
  → the pipeline gives it one chance at alternative substitution using the *current* full
  adapter set; if a fresh alternative verifies live → **replaced**; otherwise →
  **flagged** for human review. A link that's merely non-affiliate but still literally the
  correct live product is flagged, not silently replaced with an unrelated "alternative" —
  replacement only happens when the exact item itself is actually gone.
- Still live and eligible → **unchanged**.
- An offer whose adapter is no longer configured is **flagged**, never silently dropped.

This directly implements the issue's "automatically remove, replace, or flag dead,
redirected, stale, mismatched, out-of-stock, or no-longer-affiliate-eligible offers."

## 5. Coverage and threshold shortfall (`scripts/link-engine-coverage.mjs`)

`COVERAGE_TARGET = { minPct: 80, maxPct: 90 }` — the issue's affiliate coverage operating
rule. `computeGuideCoverage()` counts hero and supporting items identically (both are
just "items" to this module); `computePortfolioCoverage()` sums items across guides rather
than averaging percentages, so a 20-item guide isn't diluted to the same weight as a
3-item one.

`logCoverageShortfall()` returns `null` when a guide already meets the 80% floor;
otherwise it returns a log entry naming the exact percentage, the shortfall, and every
non-eligible item with its concrete reason (`ambiguous-match`, `out-of-stock`, `dead`,
etc.) — never just a bare number. `trackShortfallRecurrence()` aggregates a log of these
entries across runs and flags any guide with ≥ 2 shortfalls as `isSourcingPriority: true`,
implementing the issue's "repeated shortfalls become a sourcing-priority signal." None of
this ever blocks publication or swaps in a worse item to hit the number — coverage is a
reporting/quality-gate signal, and `scripts/link-engine.mjs` has no code path that lets a
coverage number influence which candidate gets picked.

## 6. CLI and simulation

- **`scripts/link-engine-cli.mjs`** — the only file that touches disk. Reads the real
  Knowledge Graph (`data/outfits.js`, `data/products.js`, `data/brands.js`) read-only,
  builds one intended item per outfit supporting-item reference, and runs it through
  whatever adapters are actually configured (in this repository: always the inert
  `http-provider` stubs — see §1). It **never writes to `data/offers.js`,
  `js/products.js`, or any `.dc.html` page** — same "why the CLI doesn't write site files
  yet" reasoning as `scripts/guide-factory-cli.mjs`. It writes a read-only report to
  `automation/status/link-engine-report.json` (git-ignored runtime state, same as every
  other file under `automation/status/` — see that directory's README) for
  `scripts/ops-status-builder.mjs` to surface on Mission Control. Running it against this
  repository's real data honestly reports 0% coverage / everything `needs-human` — that is
  correct behavior for an environment with no live provider, not a bug.
- **`scripts/simulate-link-engine.mjs`** — the actual end-to-end proof, run entirely
  against the isolated fixture universe in `scripts/__fixtures__/link-engine.mjs` (which
  never touches `data/products.js`/`js/products.js`). Exercises every scenario this issue
  names in one pass — exact match, ambiguity, no-match, dead link + alternative
  substitution, out-of-stock with no alternative, duplicate offer, brand-direct
  non-affiliate exact match, coverage/shortfall calculation, and redirect/staleness/
  affiliate-loss/out-of-stock-replacement revalidation — and exits non-zero if any
  scenario regresses.

```
node scripts/simulate-link-engine.mjs
node scripts/link-engine-cli.mjs --dry-run
```

## 7. Mission Control integration (issue #19's status contract)

`scripts/ops-status-schema.mjs` adds a closed `linkEngine` section
(`LINK_ENGINE_STATES = ['unavailable', 'below-target', 'on-target']`) to the dashboard's
status artifact. `scripts/ops-status-builder.mjs`'s `buildLinkEngine()` reads
`automation/status/link-engine-report.json` (via `scripts/ops-status-cli.mjs`'s
`loadLinkEngineReport()`) when present and degrades to `unavailable` — exactly like
`buildImageRenderer()` does for a missing spend ledger — when it isn't, rather than
guessing a coverage number that was never actually computed. A `below-target` state adds a
`link-coverage-below-target` blocker and downgrades `overallHealth` to `yellow` (same
severity tier as a stuck guide-factory job or an exhausted image budget) — this is
intentional: the 80–90% target is meant to be visible on the "is everything okay right
now?" dashboard, per the issue's "coverage percentage visible in Mission Control" and
"link status and affiliate coverage are dashboard-ready" acceptance criteria.
`ops.dc.html` renders it as a status card (coverage %, target band, needs-human count) and
an expandable detail section (coverage, needs-human/broken/shortfall counts, last run
time), same visual pattern as every other Mission Control section.

## 8. Scheduled revalidation workflow

`docs/automation/workflows/link-engine-revalidation.yml` (staged, not active — same
Claude-cannot-write-`.github/workflows/` constraint as every other workflow here) runs
`scripts/link-engine-cli.mjs` daily. Activating it today only refreshes the
"0%-coverage, N-items-need-a-human" honest report (§6) — it cannot fabricate real offer
data without a real, separately-added provider credential (never committed to this
workflow file).

## 9. Tests

`node --test scripts/__tests__/link-engine*.test.mjs` (dependency-free, deterministic, no
network) — covers every scenario this issue names:

| Scenario | Test file |
|---|---|
| Exact match (canonical id, well-separated) | `link-engine-matcher.test.mjs`, `link-engine.test.mjs` |
| Ambiguity (close competing candidates) | `link-engine-matcher.test.mjs`, `link-engine.test.mjs` |
| No candidate found | `link-engine-matcher.test.mjs`, `link-engine.test.mjs` |
| Redirect | `link-engine-verifier.test.mjs`, `link-engine.test.mjs` (revalidation) |
| Stale (due for recheck) | `link-engine-verifier.test.mjs` (`isStale`), `link-engine.test.mjs` |
| Out of stock (with and without an alternative) | `link-engine-verifier.test.mjs`, `link-engine.test.mjs` |
| Dead link | `link-engine-verifier.test.mjs`, `link-engine.test.mjs` |
| Duplicate offer | `link-engine.test.mjs` |
| Affiliate eligibility loss | `link-engine-verifier.test.mjs`, `link-engine.test.mjs` (revalidation) |
| Coverage/threshold calculation | `link-engine-coverage.test.mjs` |
| Alternative substitution (fresh-run and revalidation-triggered) | `link-engine.test.mjs` |
| Adapter contract (fixture + inert http-provider) | `link-engine-adapters.test.mjs` |

Plus `node scripts/simulate-link-engine.mjs` for the literal end-to-end fixture run (§6),
and `node scripts/link-engine-cli.mjs --dry-run` against the real Knowledge Graph as
evidence the pipeline honestly reports "no live data source" rather than fabricating one.

## What this version deliberately does not do

- Does not add a real backend, database, click-tracking redirect endpoint, or revenue
  attribution — that is `ARCHITECTURE.md` Recommendation 4 / `ROADMAP.md` Milestone 5,
  sequenced behind Milestone 3, unchanged by this issue (see "Scope note" above).
- Does not add any paid API credential, provider config, or secret — every adapter this
  repository can construct is either a deterministic fixture or a permanently inert
  `http-provider` stub.
- Does not write to `data/offers.js`, `js/products.js`, or any `.dc.html` page, and does
  not activate the staged revalidation workflow.
- Does not implement a real HTTP transport for the `http-provider` adapter mode — the
  interface exists for a future integration; this version never calls it.
