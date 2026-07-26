# Fixture-only onboarding and wardrobe intake v1

## Purpose

This slice turns WearWyzer's accepted personalization, consent, private-service,
and threat-model contracts into one coherent test-user journey. It proves how a
future user can describe style and fit, add exact products they own, and evaluate
one prospective purchase without exposing a full profile or closet to a shopping
surface.

The implementation is deliberately synthetic and local:

- route: `onboarding-wardrobe-intake.dc.html?ww_onboarding=1`
- store: `scripts/onboarding-wardrobe-store.mjs`
- persistence: browser-local fixture storage only
- candidate: verified adidas Samba OG B75806
- public navigation and indexing: disabled

It creates no production account, network endpoint, database, analytics event,
camera permission, extension permission, paid generation, or personalized
likeness.

## Surface ownership

- The future app owns wardrobe capture, inventory correction, size/fit inputs,
  consent, export, and deletion.
- The website may offer the same onboarding flow once authenticated storage and
  privacy/legal boundaries are approved.
- The future extension receives one active product decision plus minimized,
  versioned references and outfit evidence. It never receives the complete
  wardrobe, profile, sizes, or consent record.
- Mission Control receives operational stage evidence only. It never receives
  fixture or future customer payloads.

## Journey

1. Every consent purpose starts ungranted and is controlled independently.
2. Style and fit data cannot be saved until their respective purposes are
   granted.
3. Saved profile and fit signals are explicit, confidence `1.0`, and versioned.
4. Canonical search distinguishes exact, similar, ambiguous, and unknown
   results. Only an unambiguous exact product may be added.
5. Manual and simulated-camera capture candidates show field-level provenance
   and confidence. Camera inference cannot become an exact item until the user
   saves a versioned canonical correction and confirms it.
6. Each confirmed wardrobe mutation advances the snapshot version and
   freshness time.
7. Evaluation requires the three dependent consents, a complete profile, a
   fresh snapshot, and at least five exact wardrobe items.
8. The existing personalization API receives only `profileId` and
   `wardrobeSnapshotId` plus the prospective product identity.
9. Export contains the complete local fixture journey. Deletion is visibly
   pending before completion removes profile, fit, consent, and wardrobe data.
10. Reset restores the deterministic empty fixture.

## Fail-closed behavior

- Missing/revoked consent: the dependent save or evaluation is blocked
  immediately.
- Similar product: cannot be added as exact.
- Duplicate canonical name across variants: marked ambiguous and cannot be
  auto-added.
- Camera suggestion: cannot be confirmed without explicit canonical correction.
- Unknown search: returns no canonical match and adds nothing.
- Fewer than five owned items: evaluation is blocked.
- Incomplete profile or stale snapshot: evaluation is blocked.
- Stale prospective-product evidence: the existing API returns
  `stale-product-source`; the UI does not substitute another fact.
- Deleted account: further mutation is blocked until a deterministic reset.

## Verification

- 18 focused onboarding/store/privacy tests.
- 539 deterministic repository tests.
- Content, Knowledge Graph, hero-page, metadata, and static-site validators.
- Browser QA verified the default-off route, independent consent, profile save,
  exact and ambiguous search, simulated capture correction/rejection, five-item
  intake, evaluation, immediate revocation, export, pending/completed deletion,
  deterministic reset, and a clean console. Static privacy/route tests enforce
  the 375px overflow and visible keyboard-focus invariants; a physical-device
  pass remains part of the review gate.

## Production gates

Real user operation remains blocked until the founder approves:

- authentication and storage provider;
- legal/privacy treatment of personal data and measurements;
- retention, backup, deletion, and export operations;
- analytics and model-learning consent;
- browser permissions and extension-store publication;
- camera/photo intake;
- personalized likeness generation.
