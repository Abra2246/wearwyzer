# WearWyzer Book of Truth

**Document type:** Living product vision and master PRD  
**Owner:** Abraham — Founder and CEO  
**Status:** Active canonical product reference  
**Version:** 1.3
**Last updated:** July 23, 2026
**Notion source:** [WearWyzer Product Vision & Master PRD](https://app.notion.com/p/3a4a52a2f7bd8166b396c0d3c3ff940c)

This document is the repository mirror of WearWyzer's canonical product vision. Notion owns
company and product direction; the repository owns executable truth. Material product decisions
must be reflected in both places. Specialist documents may expand implementation details, but
they must not contradict this document without an explicit recorded decision.

## Executive summary

WearWyzer is a personal styling and wardrobe-intelligence platform that helps people get more
value from the clothes they own and make smarter decisions about clothes they may buy.

The product will become one connected ecosystem:

- a public **website** for discovery, guides, product intelligence, search, and commerce;
- a private **mobile app** for wardrobe inventory, Fit DNA, Style DNA, planning, and an AI
  Stylist;
- a **Chrome extension** that brings the user's wardrobe into the moment of online shopping;
- a private **Mission Control portal** for operating content, engineering, data, and commerce;
- a shared **Knowledge Graph** that supplies verified products, outfits, offers, relationships,
  and user-specific intelligence to every surface.

The defining user question is:

> I own this—or I am considering buying it. What can I wear with it, how will it fit my life,
> and is it a smart addition to my wardrobe?

WearWyzer should answer with useful outfits, compatibility evidence, sizing guidance, verified
purchase options, and honest advice—including “do not buy this” when appropriate.

## Mission, vision, promise, and north star

### Company mission

Help people make better style decisions by making the clothes they already own easier to wear
and every new purchase more useful.

### Product vision

Become the most trusted personal styling operating system: a persistent intelligence layer
connecting a person's wardrobe, body and fit preferences, Style DNA, shopping behavior, and
verified fashion knowledge across web, mobile, and everyday life.

### Brand promise

- Before purchase: **Buy it Wyzer.**
- After purchase: **You bought it. Now wear it Wyzer.**
- Over time: **Build your wardrobe Wyzer.**

### Long-term north star

WearWyzer should be the best answer to:

> **What is the smartest style decision I can make right now?**

The primary outcome is a successful personalized style decision—not a raw click, impression,
or purchase.

## Product principles

1. **Usefulness before novelty.** Every feature helps users wear, understand, organize, or buy
   clothes more intelligently.
2. **Editorial trust before monetization.** Affiliate economics break ties between equally
   strong recommendations; they never justify inferior advice.
3. **Use the closet first.** Recommend owned items before proposing purchases.
4. **Personalization compounds.** Every interaction should improve Style DNA, Fit DNA, and
   wardrobe recommendations.
5. **Verified facts and explicit uncertainty.** Never fabricate products, links, prices,
   availability, sizes, or fit claims.
6. **Relationships are the moat.** Product value comes from connections among people, clothes,
   outfits, occasions, fit, weather, content, and commerce.
7. **Privacy by design.** Wardrobe photos, measurements, behavior, and likeness are sensitive.
8. **Automate repetition; preserve judgment.** Automate mechanical work and stop for ambiguous,
   strategic, financial, legal, privacy, or destructive decisions.
9. **No fake green.** Stale, delayed, blocked, and uncertain states must be visible.
10. **One fact, one owner.** Canonical data is stored once and referenced everywhere.

## Target users

The initial editorial audience is men approximately 16–35 who buy recognizable sneakers,
outerwear, pants, knitwear, and accessible-to-premium fashion but need practical help turning
individual products into complete outfits.

Expansion audiences include professionals navigating smart casual, travelers, users with fit
uncertainty, people building intentional wardrobes, and sustainability-minded shoppers who want
to wear more and buy less. Unisex and mixed-gender use cases are welcome when naturally supported;
the launch editorial product remains menswear-first.

## Core jobs to be done

### Style what I own

- Build outfits around one owned item.
- Plan for work, weather, travel, dates, and events.
- revive rarely worn pieces.
- Create capsules and weekly rotations.

### Decide what to buy

- Measure wardrobe compatibility.
- Compare colors, variants, prices, and merchants.
- Flag redundancy.
- Recommend the highest-impact next purchase—or recommend buying nothing.

### Get the right fit

- Recommend size by brand and product.
- Explain expected silhouette and likely tight or loose areas.
- Compare with owned items that fit well.
- Express confidence and uncertainty without guaranteeing outcomes.

### Maintain my wardrobe

- Surface unworn, duplicate, damaged, or low-value items.
- Identify category and seasonal gaps.
- Recommend repair, resale, donation, replacement, or reuse.

## Product ecosystem

### Website

The public website is the discovery, editorial, SEO, product-intelligence, and commerce layer.

Core capabilities:

- hero-product pages and “5 Ways to Style” guides;
- search by product, brand, category, aesthetic, occasion, season, color, and budget;
- comparisons, alternatives, category hubs, and collections;
- deterministic recommendations and related guides;
- verified merchant offers and affiliate links;
- accounts, saved products, ownership signals, and lightweight personalization;
- analytics and conversion measurement.

The website should lead with the user problem: **What are you styling today?**

### Mobile app

The app is the private home of the full digital wardrobe and personal intelligence.

Core capabilities:

- camera scan, photo upload, search, purchase import, and manual item entry;
- wardrobe organization and wear tracking;
- Style DNA, Fit DNA, brand preferences, and budgets;
- AI Stylist, outfit calendar, packing, and closet cleanup;
- Wardrobe Value Score and shopping plans;
- personalized outfit visualization with explicit consent and privacy controls.

### Chrome extension

The extension is the shopping-decision layer. On a product page it should:

1. identify an exact, likely, similar, or unknown product;
2. check the user's wardrobe and preferences;
3. calculate compatibility, Outfit Unlocks, redundancy, and gap coverage;
4. recommend personalized complete outfits;
5. provide Fit DNA sizing guidance;
6. show verified alternatives and merchant offers;
7. save to wishlist or closet and deep-link into the app or website.

The extension must never present an approximate match as exact.

### Personalized shopping decision

The signature cross-surface experience is personalized before the purchase is made:

1. a user opens a shoe, jacket, or other product page while shopping;
2. the extension recognizes the exact item or states its uncertainty;
3. WearWyzer combines the digital wardrobe, Style DNA, Fit DNA, preferred brands, budget,
   climate, and intended occasion;
4. it recommends complete outfits using owned items first and proposes only the missing pieces;
5. it shows Outfit Unlocks, redundancy risk, likely size, verified merchants, and the honest
   recommendation to buy, wait, choose an alternative, or buy nothing;
6. the user can save the item to a wishlist or inventory and continue the same decision in the
   app or website.

Favorite and most-worn brands are explicit profile controls as well as learned signals. Brand
affinity may improve relevance and fit confidence, but it must not override better wardrobe
compatibility, value, or verified evidence.

### Mission Control

Mission Control is the private operations portal for the founder and future team. It must use
real authentication before containing sensitive data or controls.

It should expose:

- system health, heartbeats, incidents, and stalled work;
- engineering issue, branch, PR, CI, deployment, and handoff state;
- Guide Factory throughput and stage-level progress;
- image usage, quality, retries, and spend;
- Knowledge Graph health and data-quality warnings;
- affiliate coverage, broken links, stale offers, traffic, conversion, and revenue;
- a concise executive summary of what shipped, what is running, and what needs action.

## Platform architecture

```text
Website ───────┐
Mobile app ────┼──> Product and recommendation APIs ──> Knowledge Graph
Extension ─────┘                 │                          │
                                ├── Digital wardrobe       ├── Products
                                ├── Style / Fit DNA        ├── Outfits
                                ├── AI Stylist             ├── Guides
                                └── Commerce routing       └── Offers

Content research -> Guide Factory -> Image renderer -> QA -> Review PR -> Deploy
                           │                                      │
                           └──────────── Mission Control <────────┘
```

The current static repository is the foundation, not the final application architecture.
Additive migration is preferred over a rewrite. Product and relationship identifiers must remain
stable as services and authenticated experiences are introduced.

## Digital wardrobe

### Intake

- camera and label scan;
- photo upload;
- catalog search and canonical product match;
- verified purchase import;
- Chrome extension handoff;
- transparent “unverified personal item” creation.

### Wardrobe item record

Each item may contain canonical or personal ID, brand, product, category, color, material,
silhouette, size, fit notes, purchase details, condition, photos, season, occasion, last worn,
wear count, laundry state, lifecycle status, linked outfits, and provenance/confidence.

### Inventory intelligence

Detect frequently and rarely worn items, duplicates, gaps, palette imbalance, unused purchases,
seasonal readiness, repair/replacement needs, and high-leverage pieces.

## User profile and Style DNA

The user controls explicit preferences and can inspect or correct inferred ones.

### Profile inputs

- climate, lifestyle, occasions, and accessibility needs;
- favorite, most-worn, best-fitting, aspirational, and avoided brands;
- retailer, sale, secondhand, ethical, and material preferences;
- aesthetics, colors, silhouettes, formality, and fashion-risk tolerance;
- category-specific budget and investment behavior.

### Style DNA

Style DNA learns from owned items, saved/rejected outfits, purchases and returns, wear frequency,
fit feedback, browsing, wishlists, occasions, climate, and recommendation feedback.

Dimensions include aesthetic affinity, silhouette, color, material, formality, layering, brand,
lifestyle, budget, shopping behavior, wear behavior, risk tolerance, and sustainability.

Requirements:

- explain which signals influenced a recommendation;
- make every signal editable;
- preserve an exploration mode for intentional style change;
- keep private behavior private;
- use aggregate network intelligence only with consent and privacy safeguards.

## Sizing and Fit DNA

Fit intelligence may use height, optional weight, measurements, preferred fit by category, rise,
inseam, pant break, shoulders, sleeves, shoe sizing, known brand sizes, material tolerance, and
feedback from owned and returned items.

Outputs include a recommended size, confidence, expected silhouette, likely fit issues,
comparisons to owned garments, and regional conversion. Fit output is an estimate, not a promise.

## Wardrobe Value Score

Every owned item and prospective purchase may be evaluated across:

- **Compatibility Score:** fit with the actual wardrobe and Style DNA;
- **Outfit Unlocks:** new complete, non-duplicate outfits created;
- **Versatility:** seasons, occasions, palettes, layers, and aesthetics supported;
- **Gap Coverage:** whether the item fills a real need;
- **Redundancy Risk:** overlap with existing items;
- **Cost per Wear / Outfit:** estimated long-term utility;
- **Fit Confidence:** likelihood the chosen variant works;
- **Purchase ROI:** combined utility, fit, durability, price, and personal relevance.

## Outfit intelligence and AI Stylist

An outfit record includes its hero/supporting products, owned/proposed status, palette, season,
weather, occasion, silhouette, formality, fit logic, styling rationale, confidence, affiliate
coverage, assets, and feedback.

The AI Stylist is a conversational layer over verified graph and user data. It should support
closet-only outfits, one-item additions, capsules, packing, occasion planning, substitutions,
cleanup, and shopping decisions. Every response must distinguish owned, proposed, approximate,
unavailable, and uncertain items; explain its reasoning; respect budget and fit; and never
fabricate commerce facts.

## Personalized image generation

Progression:

1. editorial models with deterministic layouts;
2. adjustable proportion avatars;
3. consented visualization using measurements and references;
4. high-fidelity try-on only when geometry, privacy, and accuracy are dependable.

Personalized imagery requires opt-in, clear AI labeling, secure retention/deletion, bias testing,
and no guaranteed fit claims.

## Product intelligence, Guide Factory, and Knowledge Graph

### Core entities

User, Style Profile, Fit Profile, Wardrobe Item, Product, Brand, Retailer, Offer, Outfit, Guide,
Collection, Taxonomy, Relationship, Interaction, Recommendation, and Content Asset.

### Important relationships

Owns, wears, prefers, fits-as, pairs-with, alternative-to, similar-to, fills-gap, duplicates,
unlocks-outfit, featured-in, hero-of, works-for-season/occasion, available-at, affiliate-from,
and replaces. Editorial relationships carry confidence, reason, source, constraints, freshness,
and review status.

### Guide production pipeline

1. select a hero product or user problem;
2. verify product identity and source facts;
3. verify affiliate opportunity;
4. select supporting products;
5. audit 80–90% affiliate coverage;
6. update canonical graph relationships;
7. plan the carousel and web guide;
8. generate imagery and deterministic layout;
9. run editorial, visual, accessibility, SEO, and commerce QA;
10. create a dedicated branch and review PR;
11. publish and validate deployment;
12. measure performance and feed learnings back into planning.

### Current carousel standard

- five 1080×1080 slides;
- deterministic cover and recap typography;
- three AI-generated editorial outfit slides;
- no image-model-generated final logos, prices, typography, or product lists;
- maximum two attempts per generated image;
- $0.30 hard cap per completed guide and $30 monthly cap until explicitly changed;
- generation stops when cost, product accuracy, or quality gates fail.

## Affiliate and monetization strategy

### Operating rule

- minimum **80% affiliate-eligible coverage** across displayed purchasable products;
- **90% operating target** when equally strong verified products make it practical;
- **100% hero coverage** whenever realistically possible through the brand or an approved
  merchant.

Editorial ranking precedes commission. The canonical verification URL and preferred purchase
URL may differ. Every product can have a preferred affiliate offer, backups, regional offers,
and clearly labeled alternatives.

### Link-engine requirements

Exact product/variant match, merchant, current URL, region, price/currency, availability,
affiliate eligibility, verification timestamp, redirect/dead-link handling, staleness alerts,
and no “close enough” substitution presented as exact.

### Credential policy

Use OAuth or an approved secret store with least privilege. Never put affiliate credentials in
chat, Notion, issues, source code, browser bundles, logs, or generated assets. Routine automation
does not receive payout, banking, tax, or destructive account permissions.

### Revenue model

- **Near term:** affiliate commissions and selectively controlled sponsorships;
- **Next:** premium app subscription for advanced wardrobe, AI, fit, and planning features;
- **Future:** brand/retailer partnerships, professional tools, and privacy-safe APIs or aggregate
  intelligence.

## Phased roadmap

### Now — prove the useful content and commerce loop

P0 priorities:

1. maintain truthful Mission Control and reliable issue-to-PR automation;
2. add one verified, cooldown-eligible hero with a real source URL;
3. approve one production manifest and run the first real Guide Factory pilot;
4. run the controlled image pilot within existing caps;
5. verify supporting offers and measure affiliate coverage;
6. publish and validate the first completely automated guide;
7. build toward 20–30 premium connected guides and measurable affiliate clicks.

Exit criteria:

- no silent handoff failures;
- repeatable manifest-to-live-page path;
- ≥80% eligible commerce coverage where editorially appropriate;
- verified product, outfit, guide, offer, and relationship records;
- stable public website with useful search and internal discovery.

### Next — personalized web and commerce

- accounts, saves, wishlists, and “I own this”;
- onboarding, brand preferences, initial Style DNA and Fit DNA;
- Wardrobe Value Score prototype;
- scalable hero pages, search, collections, comparisons, and recommendations;
- affiliate connectors, offer revalidation, analytics, and performance-led content planning;
- authenticated Mission Control with business metrics.

Exit criteria: 100+ connected guides, returning signed-in users, healthy affiliate links, and
evidence that wardrobe-based advice improves decisions.

### Future — app and extension ecosystem

- full digital wardrobe and camera intake;
- Fit DNA, wear tracking, calendar, packing, cleanup, and subscription;
- Chrome extension recognition, compatibility, Outfit Unlocks, sizing, and verified offers;
- advanced AI Stylist and personalized visualization;
- privacy-safe network learning and outcome feedback.

Exit criteria: users maintain meaningful wardrobes, personalization improves outcomes, and the
extension influences real purchases without eroding trust.

### Later — platform

Retailer and brand integrations, creator/stylist tools, wardrobe and recommendation APIs,
advanced visualization, multi-market support, and privacy-safe aggregate intelligence.

## Prioritized feature backlog

### Now

- end-to-end production guide pilot;
- verified hero and offer sourcing;
- image quality pilot and editorial QA;
- content, graph, link, SEO, accessibility, and deployment validation;
- Mission Control production pipeline visibility;
- affiliate coverage and dead-link monitoring;
- hero pages, related guides, search, and mobile polish.

### Next

- accounts and saved state;
- ownership and wishlist actions;
- Style DNA and Fit DNA onboarding;
- Wardrobe Value Score v0;
- recommendation, search, and affiliate analytics;
- authenticated operations portal;
- approval-based publishing automation.

### Future

- mobile digital wardrobe;
- camera recognition and product matching;
- AI Stylist, planner, packing, cleanup, and care;
- Chrome extension;
- personalized avatars and visualization;
- purchase imports, secondhand matching, and professional tooling.

## Engineering and operating principles

1. Additive migrations over rewrites.
2. Stable IDs over display names.
3. Repository owns executable truth; Notion owns business/product truth.
4. Deterministic systems before generative systems.
5. Every public fact and relationship has provenance and freshness.
6. No production secrets in the browser or repository.
7. Tests reproduce known operational failures.
8. Every automation ends visibly: branch/PR, completed state, or actionable blocker.
9. High-risk automation is dry-run or review-gated by default.
10. Budgets, retries, and rate limits are enforced in code.
11. Accessibility, privacy, SEO, and mobile behavior are Definition of Done.
12. Features consume canonical data rather than page-specific copies.
13. Major decisions record rationale and tradeoffs.
14. No public claim is stronger than its evidence.

## Success metrics

### North-star and user value

- successful personalized style decisions;
- useful recommendations accepted;
- Outfit Unlocks created from owned items;
- purchases avoided due to redundancy;
- owned items worn more often;
- weekly users receiving wardrobe-based value.

### Product and personalization

- search success, saves, returns, ownership/wishlist actions;
- active wardrobes and verified wardrobe items;
- percentage of recommendations using owned items;
- Style DNA confidence and Fit DNA feedback;
- outfits planned, worn, and rated helpful.

### Content and data

- premium guides published and connected;
- verified hero products, outfits, offers, and relationships;
- freshness and affiliate coverage;
- QA pass rate, production cost, and cycle time.

### Commerce and growth

- affiliate CTR, conversion, and revenue by guide/product/user;
- broken/stale offer rate;
- organic traffic, social saves/shares, newsletter growth;
- app activation, extension installs, and weekly active users.

### Reliability

- automation completion and branch-to-PR handoff rate;
- CI/deployment success and recovery time;
- heartbeat freshness and silent-failure count;
- AI spend versus budget.

## Major risks and mitigations

- **Fabricated or stale product data:** provenance, confidence, nulls, and hard gates.
- **Affiliate incentives damage trust:** editorial quality ranks first and relationships are
  disclosed.
- **Poor AI imagery:** reference checks, deterministic composition, capped retries, and review.
- **Sizing harm:** evidence, confidence, conservative language, and feedback loops.
- **Sensitive personal data:** consent, encryption, deletion/export, retention, and least access.
- **False operational health:** source timestamps, SLAs, heartbeats, and external checks.
- **Premature scope:** measurable vertical slices before new surfaces.
- **Catalog maintenance cost:** canonical records, adapters, automated revalidation, and regional
  routing.

## Governance

Update this document when a product principle changes, a platform surface is approved, roadmap
phases move, privacy or monetization rules change, evidence invalidates an assumption, or a major
architecture decision changes feasibility.

Each material change should record date, decision, rationale, affected phases, implementation
references, and owner.

## Current execution record — July 21, 2026

- PR #48 fixed direct queue-to-Claude dispatch and is merged.
- PR #49 activated the Guide Factory production writer and review-PR handoff and is merged.
- The workflow passes action lint, 403 deterministic tests, the production simulation, and all
  current content/site/Knowledge Graph/hero-page validators.
- The current honest blocker is product data: no cooldown-eligible hero record has a verified
  `sourceUrl` sufficient for a real approved manifest.
- The next vertical slice is: verify one hero → approve one manifest → generate one guide →
  verify offers → render images → open review PR → deploy → measure in Mission Control.
- The Chrome extension stays in the roadmap but follows proven product intelligence,
  recommendations, and user value on the website.

## Current execution record — July 22, 2026

- The GitHub audit found no open pull requests and confirmed that both Mission Control status
  feeds are refreshing. Repository inactivity was not caused by the dashboard pipeline.
- The active P0 blocker is Issue #51: the Guide Factory created rendered slide strings and
  referenced their paths, but its production writer did not persist or stage those assets.
- The reliability repair adds fail-closed, idempotent slide and cover persistence, synchronizes
  active/reference workflows, and proves the full fixture path through static QA before any live
  pilot is attempted.
- After this repair is reviewed and merged, the next priority is one verified, review-gated
  production pilot—not a new surface. The Chrome extension, mobile app, Digital Wardrobe, Style
  DNA, Fit DNA, Wardrobe Value Score, and AI Stylist remain the documented destination and will be
  built through measurable vertical slices.

## Current execution record — July 23, 2026

- PR #53 merged the Guide Factory asset-persistence repair; the clean repository passes 409
  deterministic tests plus content, site, Knowledge Graph, adapter, and hero-page validation.
- The apparent queue stall was traced to Issue #54's missing required `Validation requirements`
  section. After repairing the issue contract and re-running the dispatcher, #54 was selected and
  dispatched successfully.
- Issue #55 now owns the permanent reliability fix: Mission Control must distinguish a
  ready-labeled issue from an actually eligible issue and show rejection reasons.
- Issue #11 is normalized as the next low-risk QA task. Issue #33 is explicitly blocked until the
  personalization slice, public API, privacy boundary, verified offers, and browser-permission
  approval exist.
- `NEXT_ACTIONS.md` is the executable handoff queue. `docs/adr/` owns durable decisions.
  `docs/EXECUTION_30_60_90.md` owns the measurable near-term path, and
  `docs/PERSONALIZATION_PLATFORM_V1.md` defines the smallest useful personalized purchase slice.
- PR #60 proved that concurrent operations-feed writers can both update `main` without false
  non-fast-forward failures.
- PR #63 made queue eligibility evidence-based across dispatch, Mission Control, and issue lint.
- Issue #54 stopped before generation because its verified hero was sold out and inside the
  60-day cooldown; no paid call or public asset was created.
- Issue #61 is the active fail-closed handoff repair. It prevents a model process from reporting a
  green engineering outcome without a linked PR, non-empty issue branch, or structured blocker.
- PR #64 implemented that immediate postcondition. Its first live exercise on Issue #11 exposed a
  narrower false-positive: the verifier accepted an unchanged branch created 12 days before the
  run. Issue #65 now requires a pre-run baseline and evidence created or advanced by the current
  run; historical branches and blocker comments cannot turn a new run green.
- Issue #11 remains unfinished after that agent run and moves to direct implementation after #65.
- Issue #62 is the next production pilot, using the verified adidas Samba OG B75806 after the
  reliability and metadata gates are stable.

## Final north-star statement

> **WearWyzer becomes the trusted personal-style layer between what someone owns and what they
> may buy—helping them buy better, wear more, understand fit, and build a wardrobe that works as
> a system.**
