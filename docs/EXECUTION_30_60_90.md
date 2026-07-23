# WearWyzer 30/60/90-day execution path

The dates are relative to approval of this operating plan. Sequencing is dependency-driven; time
targets do not override evidence or quality gates.

## Days 0–30 — prove the factory and establish truth

**Primary outcome:** one repeatable, review-gated product-to-guide loop and an operations system
that accurately explains every no-op.

| Work | Owner role | Dependency | Acceptance measure |
|---|---|---|---|
| Complete Issue #54 pilot | Content-production agent | Verified hero source | Review PR with persisted assets, source timestamp, validations, coverage, spend |
| Ship Issue #55 eligibility telemetry | Reliability agent | #54 leaves active slot | Labeled-ready and eligible-ready reported separately; malformed fixture caught |
| Ship Issue #11 metadata QA | QA agent | #55 leaves active slot | Intentional bindings pass; known unresolved static token fails |
| Establish ADRs and next-action handoff | Product/architecture lead | None | Every major decision and next three tasks discoverable in repo |
| Reconcile Notion Book of Truth | Product lead | Documentation PR | Notion and repo agree on mission, Now/Next/Later, evidence and blockers |
| Run one controlled image pilot | Content-production agent | Approved manifest and existing caps | Reviewable output, recorded cost, no auto-publish |

**30-day metrics**

- 100% active automation has issue, branch/run, and terminal evidence.
- Zero false-green Mission Control states.
- One complete pilot guide reaches review.
- 100% pilot product facts have provenance.
- Affiliate-eligible coverage is measured; target ≥80% where editorially appropriate.

## Days 31–60 — stabilize content and commerce

**Primary outcome:** a small but repeatable business engine producing verified, useful content.

| Work | Owner role | Dependency | Acceptance measure |
|---|---|---|---|
| Produce 3–5 additional guides | Content-production agent | Pilot lessons incorporated | Quality gates pass; no hero/concept cooldown violations |
| Harden offer revalidation | Commerce-data agent | Secure connector metadata | Stale/dead/mismatched offers detected; no secret values in repo |
| Add production-stage telemetry | Reliability agent | Stable factory states | Research → verification → assets → QA → review visible in Mission Control |
| Complete personalization schemas | Product/data architect | ADR privacy boundary | Versioned user/wardrobe/decision contracts with migrations |
| Define analytics events | Product/data architect | North-star metrics | Privacy-minimized event dictionary and retention policy |

**60-day metrics**

- 3–5 review-approved guides from the factory.
- ≥80% affiliate-enabled product coverage across planned/published content when equally strong.
- Zero invented price, stock, affiliate, product, or fit facts.
- Median stalled-handoff detection under its SLA.
- Every production stage emits started, completed, blocked, or failed evidence.

## Days 61–90 — prove personalization

**Primary outcome:** the thinnest useful personalized purchase decision behind a feature flag.

| Work | Owner role | Dependency | Acceptance measure |
|---|---|---|---|
| Build profile + manual wardrobe | Product engineer | Auth/privacy prototype decision | User can create, export, and delete test data |
| Build deterministic compatibility evaluator | Recommendation engineer | Canonical item taxonomy | Explainable score and confidence from owned items |
| Add outfit/gap/redundancy signals | Recommendation engineer | Evaluator | Suggestions cite wardrobe items and distinguish missing pieces |
| Add prospective-purchase result | Product engineer | All above | Buy/wait/skip recommendation with Outfit Unlocks and rationale |
| Evaluate extension API boundary | Security/product lead | Personalization slice | Threat model and minimal public/private contracts, no extension publication |

**90-day metrics**

- A test user can add at least five wardrobe items and evaluate one prospective product.
- The result includes compatibility, 2–3 outfits, redundancy/gap signals, Outfit Unlocks,
  confidence, and an honest purchase recommendation.
- Owned items are preferred before new products.
- Personal data can be exported and deleted.
- No personalized imagery is generated without separate explicit consent.

