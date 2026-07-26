# AI Stylist editorial preference rubric v1

## Boundary

Editorial preference is evaluated only after a candidate passes every
non-negotiable trust metric at 100%. Preference can never compensate for weak
grounding, citations, abstention, privacy, action safety, or repeatability.

## Dimensions

Every review scores five dimensions from 1–5 with a required rationale:

- usefulness;
- clarity;
- styling quality;
- WearWyzer voice; and
- actionability.

The shared anchors range from actively unhelpful or unusable at 1 to
exceptional editorial value with no material revision needed at 5.

## Decision rules

- Fewer than two reviews for any candidate produces `needs-more-reviews`.
- A two-point or larger reviewer spread on any dimension produces
  `review-required`; individual scores and rationales remain visible.
- Equal top scores produce an explicit `tie`.
- Only a unique top score with sufficient reviews and no material disagreement
  produces `selected`.

Reviewer aliases are used only to prove independent fixture reviews and are
removed from the aggregate. No reviewer account, analytics, or behavior
learning exists.

## Deferred

Production reviewer identity, model/provider selection, prompts, credentials,
paid evaluation, real user data, analytics, publishing, automated preference
learning, and external actions remain outside this slice.
