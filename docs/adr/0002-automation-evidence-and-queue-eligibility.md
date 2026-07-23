# ADR-0002 — Evidence-based automation and queue eligibility

**Status:** Accepted  
**Date:** July 23, 2026  
**Owner:** Reliability lead

## Context

Issue #54 was labeled `ready`, but the dispatcher rejected it because a required issue section was
missing. Mission Control counted labels rather than dispatcher eligibility and reported a stalled
queue. Both systems were locally consistent but the combined operator view was misleading.

## Decision

- Labels express intended workflow state; validation determines executable eligibility.
- Dispatcher and Mission Control must consume the same issue-contract rules.
- Mission Control reports labeled-ready, eligible-ready, blocked, malformed, risk-gated,
  in-progress, review, failed, and completed states separately.
- “Stalled dispatch” applies only when eligible work exceeds the dispatch SLA with no active issue
  or review PR.
- A successful HTTP fetch never proves freshness; `generatedAtIso` and source timestamps do.
- Every automation terminates with evidence: review PR, completed state, or actionable blocker.

## Alternatives considered

- **Auto-repair malformed issues:** rejected because changing scope automatically may alter intent.
- **Treat every ready label as eligible:** rejected by the observed false-stall failure.
- **Hide invalid issues:** rejected because operators need exact remediation.

## Consequences

Issue forms remain strict, but failures become visible and actionable. Queue telemetry carries more
detail, and schemas/tests must evolve together.

## Evidence

The July 23 dispatcher log rejected #54 for missing `validation requirements`. After adding that
section, the same job selected and dispatched #54 successfully.

## Review trigger

Revisit when GitHub Issues are replaced or augmented by a database-backed task orchestrator.

