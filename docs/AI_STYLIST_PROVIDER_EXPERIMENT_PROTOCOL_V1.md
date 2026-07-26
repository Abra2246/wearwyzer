# AI Stylist provider experiment protocol v1

Status: specification only. No external provider call is authorized or
implemented.

## Purpose

This protocol makes the first external AI Stylist comparison a founder-gated,
bounded experiment rather than an implicit product launch. It is downstream of
the deterministic trust gate and the human editorial rubric.

## Planning manifest

The closed manifest names only:

- an experiment ID;
- the accepted fixture version and all 15 trusted scenarios;
- one to three opaque candidate IDs;
- hard request, retry, timeout, and USD-cent ceilings; and
- zero-default authorization fields.

It cannot contain a provider, model, prompt, credential, user profile,
wardrobe, request, response, or token. A planning manifest with any approval
set to true is invalid. Approval must be a separate founder record created
after reviewing the proposed scope.

## Required founder decisions

Before external processing, the founder must separately approve:

1. the provider and private model/configuration;
2. use of an environment-managed credential;
3. the stated hard spend ceiling;
4. processing of the synthetic fixture corpus; and
5. the experiment run itself.

No approval is inferred from merging this protocol.

## Execution invariants

- Only the accepted synthetic corpus may be processed.
- Credentials stay in the execution environment and never enter artifacts.
- The declared request, retry, timeout, and spend ceilings are hard stops.
- Provider errors, schema drift, missing provenance, missing cost evidence,
  incomplete outputs, nondeterminism, and any safety regression stop the run.
- Every candidate passes the existing 100% trust thresholds before editorial
  scoring begins.
- Editorial preference cannot override grounding, citation completeness,
  abstention correctness, privacy, action safety, or repeatability.
- There is no publication, account mutation, shopping action, or automated
  production model selection.

## Sanitized founder packet

The decision packet contains the experiment/corpus identifiers, opaque
candidate IDs, declared limits, observed request count and spend, evidence
completeness flags, trust/editorial statuses, authorization state, stop reasons,
and final decision status.

It excludes provider/model details, prompts, drafts, credentials, requests,
responses, raw evidence, private configuration, profiles, wardrobes, and real
user data. Missing approval yields `not-authorized`; incomplete evidence yields
`incomplete`; limit or safety failures stop the experiment; ties and material
editorial disagreement require review.

## Deferred implementation

Provider selection, credential storage, a network adapter, paid execution,
production telemetry, real user data, automated model routing, publication,
external actions, and likeness generation remain outside this milestone.
