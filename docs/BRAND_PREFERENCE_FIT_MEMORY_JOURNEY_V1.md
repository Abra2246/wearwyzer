# Brand Preference and Fit Memory journey v1

Status: fixture-only, default-off, deterministic, unlinked, and `noindex`.

## Purpose

The route makes the accepted Brand Preference and Fit Memory contract
reviewable before any real profile service, app, or extension integration
exists. It shows how WearWyzer can remember brand choices and coarse fit
outcomes without observing shopping behavior or allowing preference to outrank
better styling and fit evidence.

## Route and modes

- Route: `brand-preference-fit-memory-fixture.dc.html?ww_brand_memory=1`
- Explicit and inferred roles remain visibly distinct.
- A correction may remove avoidance and add a user-directed role.
- A later correction may reverse an earlier correction without stale memory.
- Avoided brands remain excluded.
- Avoidance combined with a positive role requires review.
- Low-confidence inference remains absent.

Changing the evidence mode clears the prior result. Reset restores the
deterministic initial mode and keyboard focus.

## Visible evidence

The page renders only the accepted minimized result:

- brand role and status;
- explicit, correction, or inferred provenance;
- confidence and allowlisted evidence codes;
- stable owned-item fit reference, category, coarse size, outcome, and source;
- conflicts requiring user review; and
- the fixed recommendation priority.

## Safety boundary

The fixture stores nothing and performs no network, analytics, tracking,
account, affiliate, retailer, purchase, or other external action. It accepts no
real profile or wardrobe data and renders no browsing, raw wear, purchase,
return, private note, price, commission, popularity, or account information.

Brand preference remains `tie-break-only` after styling quality, WearWyzer
usefulness, editorial credibility, and verified fit.
