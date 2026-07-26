# Outfit Compatibility journey v1

Status: fixture-only, default-off, deterministic, unlinked, and `noindex`.

## Purpose

The route makes Style DNA-aware Outfit Compatibility understandable before any
real profile, wardrobe, account, app, extension, or AI Stylist integration. It
shows why an outfit works—or why WearWyzer should abstain—without an opaque
match score.

## Route and modes

- Route:
  `outfit-compatibility-fixture.dc.html?ww_outfit_compatibility=1`
- Compatible owned-first outfit.
- Unknown fit evidence requiring review.
- Explicit negative Style DNA block.
- Conflicting fit block.
- Missing required outfit role.
- Comparison with a clear leader.
- Exact comparison tie.
- No qualified compared outfit.

Changing the evidence state clears the prior result. Reset restores the
deterministic default and keyboard focus.

## Visible evidence

The page renders:

- compatibility or comparison status;
- overall score, evidence coverage, and confidence;
- eight decomposed score parts;
- hard incompatibilities and missing evidence;
- minimized reason codes;
- target context;
- stable item references labeled owned, prospective, or missing;
- product-evidence and fit states; and
- every comparison evaluation, leader, tie, or none-qualified result.

## Safety boundary

The fixture stores nothing and performs no profile/wardrobe access, network,
analytics, tracking, account, affiliate, retailer, purchase, or external
action. Product truth, ownership, fit, Style DNA, target, and composition
remain separate. No full private payload, browsing, purchase/return history,
price, commission, popularity, or credential data is rendered.
