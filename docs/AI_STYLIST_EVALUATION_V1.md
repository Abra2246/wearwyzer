# AI Stylist evaluation harness v1

## Purpose

The evaluation harness is the trust regression gate for WearWyzer's
conversational styling layer. It proves the provider-agnostic contract before a
live model, prompt, or paid call is considered.

## Scenario portfolio

The deterministic fixture portfolio contains:

- one passing scenario for each supported intent: owned-item styling, occasion
  planning, purchase evaluation, gap identification, option comparison, and
  recommendation explanation;
- adversarial missing-citation, unowned-item, invented-price, stale-source,
  ambiguous-source, conflicting-source, private-field, external-action, and
  insufficient-evidence scenarios.

The harness invokes only local contract functions. It has no network or
provider adapter.

## Metrics

Every scenario produces boolean evidence for:

- grounding;
- citation completeness;
- abstention correctness;
- privacy minimization;
- external-action safety;
- deterministic repeatability.

The portfolio threshold is 100% for every metric. All six positive intents must
pass. Any failed scenario, missing intent, or threshold shortfall fails the
portfolio and identifies the exact scenario, outcome, error, and metric.

Ten deterministic harness tests cover intent coverage, every adversarial class,
exact errors, abstention, privacy, action safety, repeatability, portfolio
thresholds, broken-scenario reporting, duplicate IDs, and empty input. The full
repository baseline is 589 passing tests plus every deterministic content,
Knowledge Graph, hero-product, metadata, static-site, and diff validator.

## Privacy

Reports contain normalized minimized outputs only. They do not contain private
prompts, raw profile or wardrobe facts, credentials, measurements, photos, or
correction histories.

## Production gate

No live model/provider, paid spend, prompt optimization, real user, production
storage, analytics, calendar/location access, camera/photo workflow, affiliate
credential, Chrome permission, external action, publishing, or likeness
generation is authorized.
