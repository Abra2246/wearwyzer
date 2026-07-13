# WearWyzer — OpenAI Images API renderer v1 (issue #18)

Companion to `docs/AUTONOMOUS_GUIDE_FACTORY_V1.md` (issue #17, which built the guide factory
pipeline and its inert `external-provider` renderer interface) and `docs/AUTONOMOUS_ENGINEERING_V1.md`
(issue #16's queue foundation). This document is the canonical spec for everything issue #18
scopes: the OpenAI Images API provider adapter, the WearWyzer prompt compiler, the hybrid
(generative + deterministic) rendering architecture, reference preservation / visual QA,
the asset pipeline, cost and rate controls, and the controlled pilot.

## Operating principle

A generated image is a paid, external, brand-facing asset — every rule in this document exists
to keep that safe by default: fail closed on any credential/rate/budget problem, never let the
image model own final typography, and never accept an uncertain visual result automatically.
`docs/AUTONOMOUS_GUIDE_FACTORY_V1.md`'s "never guess, never fabricate" principle applies here
identically — a generation this pipeline cannot verify is `needs-human`, never a silent accept.

## 1. Provider adapter (`scripts/openai-image-provider.mjs`)

Node's built-in `fetch`, no npm package (this repo has no package manager, per `CLAUDE.md`),
with an injectable `fetchImpl` — same pattern as `scripts/queue-github-client.mjs` and
`scripts/deploy-health-check.mjs` — so every scenario is testable without real network access
or a real key.

- `readApiKeyFromEnv()` is the **one** sanctioned way to source `OPENAI_API_KEY` — it only ever
  reads `process.env.OPENAI_API_KEY`. No script in this change accepts a key through argv, an
  issue body, a comment, a file, or any other channel, and none of them ever log it, echo it, or
  include it in a returned result object.
- `generateImage()` calls the images-generations endpoint (text-to-image) or the images-edits
  endpoint (reference-image edit workflow, when `referenceImageBase64` is supplied) exactly
  once — no retry loop here; that decision belongs to the caller (§6).
- **Fails closed for every unhappy path** — this module never throws for a classified error, it
  always returns `{ status: 'blocked', errorType, reason }`:

  | Scenario | `errorType` | Retryable? |
  |---|---|---|
  | Missing key | `missing_key` | no |
  | Invalid/expired key (401/403) | `invalid_key` | no |
  | Rate limited (429) | `rate_limited` | yes |
  | Moderation/content-policy refusal | `moderation_refused` | no |
  | Server error (5xx) | `server_error` | yes |
  | Network failure | `network_error` | yes |
  | Malformed/missing response data | `malformed_response` | no |

- Model defaults to `gpt-image-2` (the primary renderer named in issue #18) but is fully
  configurable per call — trivial to repoint at a different model id once one is confirmed
  against a real account.

## 2. Prompt compiler (`scripts/openai-prompt-compiler.mjs`)

Pure, versioned (`PROMPT_SCHEMA_VERSION`). `compileEditorialPrompt()` compiles hero product
identity + colorway, outfit composition (from the manifest's own outfit/item records — never
invented), model presentation/setting/pose/camera/lighting direction, the WearWyzer visual
language (in words, matching `scripts/guide-renderer-adapter.mjs`'s palette), and every hard
exclusion (`HARD_EXCLUSIONS`): never change colorway/silhouette/logo placement, never depict a
different hero product, never duplicate limbs, and — the one every other rule here depends on —
**never render legible text**. `compileFinalLayoutPrompt()` exists only to assert (and
unit-test) that it always throws: there is no valid compiled prompt for the layout layer,
because that layer never goes to the image model (§3).

If no verified reference image is supplied, the compiled prompt says so explicitly and states
the generation must be routed to human review — the compiler never pretends an unverified hero
product is verified.

## 3. Hybrid rendering architecture

The image model **never** typesets the final carousel. Two rendering layers:

- **OpenAI Images**: editorial/outfit imagery for slides 2 through (N-1) of a guide's carousel —
  model/outfit photography, no text, no logos.
- **Deterministic SVG** (`scripts/guide-renderer-adapter.mjs`'s existing palette/type, extended
  by `scripts/openai-hybrid-renderer.mjs`'s `compositeHybridSlideSvg()`): the cover slide, the
  summary/shop-the-looks slide, and — for every hybrid slide — the slide number, headline label,
  and editorial-direction copy are drawn as real SVG `<text>` elements on top of the generated
  image, never as image-model output. This is exactly issue #18's requirement: headlines,
  product lists, prices, style tips, logos, and slide numbers stay deterministic; only the
  photography is generative.

`scripts/openai-hybrid-renderer.mjs`'s header explains in detail *why* this isn't wired as a
literal `mode: 'external-provider'` implementation inside `scripts/guide-renderer-adapter.mjs`:
that module is intentionally synchronous and network-free (issue #17's own design, and every
existing test assumes a plain synchronous return value). A real OpenAI call is inherently async
I/O, so the hybrid renderer produces the identical `{ slideOrder, mode, format, status, content }`
shape via its own async pipeline, and the caller (`scripts/guide-factory.mjs`'s
`runGuideFactoryJob`) accepts it through the new, additive `precomputedRenderedAssets` parameter
— default `null`, so every existing caller/test is completely unaffected. Every downstream check
(content quality policy, asset naming/existence) applies identically regardless of which
renderer produced the array: this **is** "integrated behind the existing Guide Factory adapter"
in the sense that matters — same contract, same consumer, same gates.

## 4. Reference preservation & visual QA (`scripts/reference-preservation-check.mjs`)

Two kinds of check:

1. **Structural rules this repo can verify with certainty today**: was a reference image
   actually supplied for a hero-involving slide (`no-reference-image-supplied` — a hard reject
   if not); did the caller somehow ask the image model to render final text (a caller bug, also
   a hard reject).
2. **Pixel-level categories that genuinely require a vision pass** — wrong colorway, changed
   silhouette, missing/malformed hero item, duplicated limbs/garment artifacts, unreadable
   embedded text. This repo has no image-processing dependency to run real computer vision
   (`CLAUDE.md`: no package manager, dependency-free scripts). Being honest about that
   limitation **is** the safety property issue #18 asked for: `evaluateSlidePreservation()`
   defaults every one of these categories to **`needs-human`**, not accept, unless the caller
   supplies concrete `visionSignals` from an actual review pass (human today; a future
   automated vision-model integration could populate the same shape later). Only when
   `visionSignals` explicitly clears every category does a slide reach `verdict: 'accept'`.

   A generated slide that is blocked for visual QA still carries its composited image as
   `previewContent` (distinct from `content`, which stays `null` whenever `status` isn't
   `'rendered'`, matching `scripts/guide-renderer-adapter.mjs`'s existing contract) — so a human
   reviewer has something concrete to look at instead of nothing.

`evaluateHeroConsistencyAcrossSlides()` additionally rejects (to `needs-human`) any set of
accepted slides for one guide that don't all agree on the same hero product — never let it
silently drift slide to slide.

**What this version deliberately does not do:** run real pixel-level computer vision. Wiring an
actual vision-model review pass (or a human-in-the-loop UI) to populate `visionSignals` is a
separate, future decision — every hook needed to plug one in already exists (`visionSignals` /
`visionSignalsBySlide`), so doing so later is additive, not a redesign.

## 5. Asset pipeline (`scripts/openai-asset-pipeline.mjs`)

Pure naming/checksum functions plus one thin fs-writing function (`writeGuideAssets`), same
pure/IO split as every other module here:

- `slideAssetPath()` matches the existing `slide-NN.<ext>` convention
  `scripts/content-quality-policy.mjs`'s `checkAssetNamingAndExistence()` already enforces.
- `sourceEditorialAssetPath()` keeps the raw generated editorial image in a separate `source/`
  subpath from the composited final slide — issue #18's explicit "source editorial images
  separately from composited final slides" requirement.
- `sha256()` / `buildAssetManifestEntry()` record a checksum for both the final and (when
  present) the source asset, so an accidental re-render can never silently replace an asset
  without the change being visible in the manifest/PR diff.

## 6. Cost and rate controls (`scripts/openai-cost-controls.mjs`)

Pure — no I/O, no clock reads; the caller supplies `now` and persists/reloads the spend ledger
(`scripts/openai-spend-ledger.mjs`, append-only JSON lines at
`automation/status/openai-spend.jsonl`, the same pattern as
`scripts/record-status-event.mjs`'s `events.jsonl`).

Approved pilot defaults (issue #18 comment thread), all in `DEFAULT_LIMITS`:

| Control | Default |
|---|---|
| Per-guide hard cap | $0.30 |
| Monthly ceiling | $30 |
| Max attempts per editorial image | 2 |
| Max accepted generated images per guide | 3 |
| Draft quality | low |
| Final quality | medium (only generated after the draft passes visual QA) |

`evaluateAttempt()` is the single gate every generation call must pass — max attempts, max
accepted images, and both budget caps — before the provider is ever invoked; it never guesses
past a limit. `computeBackoffDelayMs()` is exponential with a ceiling, used only for the
provider's own retryable errors (`rate_limited`, `server_error`, `network_error`). When any cap
is hit, the pipeline reports `status: 'blocked'` with the specific reason — the queue-level
"pause and mark `needs-human`" behavior issue #18 asks for is this same fail-closed contract,
surfaced through `scripts/guide-factory.mjs`'s existing `needs-human` outcome.

## 7. Secure GitHub Actions integration

Same permission constraint as issues #16/#17/#22: Claude's GitHub App token cannot write to
`.github/workflows/`. `docs/automation/workflows/openai-pilot-dispatch.yml` is staged (not
active) for a maintainer to copy in. It is written to satisfy every constraint in issue #18
section 7:

- Only runs on `workflow_dispatch` (manual) or a schedule on `main` — **never** on
  `pull_request` from a fork, so a forked PR can never see the secret.
- `OPENAI_API_KEY` is passed as an `env:` var sourced from `secrets.OPENAI_API_KEY` and is never
  echoed, logged, or written to an artifact by the workflow itself.
- Defaults `dry_run: true` and requires an explicit `--simulate`-free invocation to spend
  anything real — `scripts/openai-renderer-cli.mjs` itself refuses to call the real provider
  whenever `OPENAI_API_KEY` is absent unless `--simulate` was explicitly requested (in which
  case it uses the same fake, no-network generator as the pilot, regardless of key presence).

## 8. Validation

```
node --test scripts/__tests__/*.test.mjs
```

Dependency-free, deterministic, no network — covers every scenario issue #18 section 8 lists:

| Scenario | Test file |
|---|---|
| Successful generation | `openai-image-provider.test.mjs`, `openai-hybrid-renderer.test.mjs` |
| Reference-image edit | `openai-image-provider.test.mjs`, `openai-hybrid-renderer.test.mjs` |
| Missing key | `openai-image-provider.test.mjs`, `openai-hybrid-renderer.test.mjs` |
| Invalid key | `openai-image-provider.test.mjs` |
| Rate limit | `openai-image-provider.test.mjs` |
| Moderation refusal | `openai-image-provider.test.mjs`, `openai-hybrid-renderer.test.mjs` |
| Malformed response | `openai-image-provider.test.mjs` |
| Budget exhaustion | `openai-cost-controls.test.mjs`, `openai-hybrid-renderer.test.mjs` |
| Inconsistent hero product | `reference-preservation-check.test.mjs` |
| Rejected visual QA | `reference-preservation-check.test.mjs`, `openai-hybrid-renderer.test.mjs` |
| Fallback deterministic rendering | `openai-hybrid-renderer.test.mjs` (deterministic renderer proven untouched), `guide-renderer-adapter.test.mjs` |

## 9. Pilot (`scripts/simulate-openai-pilot.mjs`)

Runs the complete hybrid pipeline — prompt compilation, draft+final generation, cost/rate
controls, reference-preservation QA, deterministic compositing, and the existing Guide Factory
content-quality gate — against the isolated fixture manifest
`OPENAI_PILOT_MANIFEST` (`scripts/__fixtures__/guide-jobs.mjs`): 5 slides matching the approved
pilot defaults (slide 1 cover + slide 5 shop-the-looks summary stay deterministic-template;
slides 2–4 are editorial outfit imagery).

**This is a simulation, not a live run** — the provider call is an injected fake (deterministic
fake image bytes, no network, no real `OPENAI_API_KEY`, $0 real spend), for two reasons:

1. Spending real, freshly-provisioned budget autonomously, with no human present to confirm the
   actual charge, is treated as a consequential action outside what an unattended agent run
   should do unilaterally — the issue itself requires this pilot to "stop before publication,"
   and the safest reading of that is to not spend real money without a human watching either.
2. This repository's own `.github/workflows/claude.yml` Bash allowlist has no network egress to
   `api.openai.com` (only `curl` to `localhost` is permitted) — a real call could not succeed in
   this environment even if attempted.

`scripts/openai-renderer-cli.mjs` is the real, live-capable entry point (env-only key,
automatic simulate-mode fallback when no key is present, explicit `--simulate` flag) for a
maintainer to run for real once the staged workflow is activated and a real, approved
OpenAI-hybrid guide manifest exists (none ship in this change — see
`automation/guide-jobs/README.md` for why no fixture guide is published to the live site,
which applies identically here).

Run it with:

```
node scripts/simulate-openai-pilot.mjs
```

**What the pilot proves, and what it deliberately does not:** draft generation, cost-gated
final generation, and deterministic compositing all succeed end-to-end for every editorial
slide, and the pipeline reaches `outcome: 'needs-human'` at the content-quality-policy stage —
**not** `ready-for-pr` — because no automated vision-QA signal exists yet (§4). Exit code `1` if
that ever stops being true: a fixture manifest with no vision signals reaching `ready-for-pr`
would mean the pipeline started silently accepting unverified generative output, which is
exactly the regression this simulation exists to catch. Per-slide spend in the simulation
totals $0.06 (three slides × the $0.02 draft-quality estimate; final-quality generation is
correctly never attempted once a slide fails visual QA at the draft stage, since there's nothing
to gain from spending more on an image that's already going to be flagged) — and, as stated
above, none of it is real money.

## What this version deliberately does not do

- Does not run real pixel-level computer vision — see §4's honest limitation and its documented
  extension point (`visionSignals`).
- Does not spend any real money or make any real network call to OpenAI in this change — see §9.
- Does not publish to Instagram or any external platform, and does not merge or deploy the pilot.
- Does not accept `OPENAI_API_KEY` through any channel other than the environment, and never
  logs it.
- Does not permit unlimited retries or spend — every attempt is gated by `DEFAULT_LIMITS` (§6).
- Does not change `scripts/guide-renderer-adapter.mjs`'s existing synchronous, network-free
  contract or any of its tests — see §3 for why, and `scripts/guide-factory.mjs`'s additive
  `precomputedRenderedAssets` parameter for how integration happens instead.
- Does not activate any new scheduled workflow — `.github/workflows/` is outside this change's
  permitted scope (§7).
