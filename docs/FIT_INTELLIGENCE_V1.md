# Fit Intelligence v1

Status: fixture-only, deterministic, provider-neutral, and read-only.

## Purpose

Fit Intelligence helps a user choose among currently available sizes without
pretending that size guidance is a guarantee. It can eventually serve the
website, app, and Chrome extension through one minimized contract.

## Accepted evidence

The first version accepts only:

- an explicit coarse category and preferred silhouette;
- an explicit usual size in a closed size system;
- corrected or inferred known-brand fit outcomes tied to stable owned-item
  references; and
- current verified product evidence containing the available sizes, product
  fit tendency, and any supplied regional conversions.

Explicit same-brand corrections outrank the usual-size default. Conflicting
corrections, stale/ambiguous/missing evidence, unsupported systems, and
unavailable evidence-backed sizes never produce a substitute guess.

## Result

When evidence supports guidance, the result contains:

- recommended size and confidence;
- expected silhouette;
- likely-issue and reason codes;
- only the supplied regional conversion for that size;
- minimized owned-item comparisons; and
- product evidence version, state, and verification time.

Every result states that guidance can vary by body, material, construction, and
preference. It is not a promise.

## Privacy and commerce boundary

The response excludes measurements, weight, height, body-shape or protected
attribute inference, photos, private notes, full fit history, account data,
prices, retailer preferences, affiliate status, and commission. Monetization
and popularity never influence sizing.

No provider, network call, account, production storage, camera/photo workflow,
purchase, paid generation, browser permission, publication, or personalized
likeness workflow is introduced.
