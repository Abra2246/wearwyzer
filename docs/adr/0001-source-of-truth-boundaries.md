# ADR-0001 — Source-of-truth boundaries

**Status:** Accepted  
**Date:** July 23, 2026  
**Owner:** Product and architecture lead

## Context

WearWyzer uses Notion for company/product direction, GitHub for executable work, generated
Mission Control feeds for operational evidence, and future databases for user and commerce data.
Treating any one surface as authoritative for everything has already produced stale or misleading
status.

## Decision

- Notion owns approved mission, strategy, product principles, and business roadmap.
- `docs/WEARWYZER_BOOK_OF_TRUTH.md` is the repository mirror and product contract for agents.
- GitHub issues own scoped executable work; PRs, checks, and commits own implementation evidence.
- Canonical repository data owns current static product/guide facts until migrated.
- Mission Control is a read model, never a fact owner. It derives state from source timestamps and
  repository evidence.
- Future authenticated storage owns user profile, wardrobe, consent, and behavioral data.
- `NEXT_ACTIONS.md` owns only the short executable handoff and must link to the canonical sources.

## Alternatives considered

- **Notion as the only source:** rejected because runtime and test evidence does not live there.
- **GitHub as the only source:** rejected because company/product direction needs accessible,
  non-code governance.
- **Mission Control as the source:** rejected because dashboards are derived and can be stale.

## Consequences

Material decisions must be synchronized between Notion and the repository mirror. Drift is visible
and corrected, not resolved by silently picking whichever version is convenient.

## Review trigger

Revisit when the first production database or authenticated admin system becomes canonical.

