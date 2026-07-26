# Fixture wardrobe capture normalization and correction v1

## Purpose

This slice proves the trust boundary between a future manual/camera wardrobe
intake and WearWyzer's canonical product inventory. It does not scan or upload
anything. Instead, deterministic synthetic fixtures exercise the same states a
future vision provider must return.

The product rule is simple: inference may suggest; only the user may confirm.

## Intake states

- `manual-search`: a user-entered query is classified against the canonical
  catalog. Even one exact result remains review-required until confirmation.
- `simulated-camera`: a synthetic fixture produces field-level suggestions.
  These always remain `suggested`, `ambiguous`, `similar`, or `unknown` until an
  explicit correction selects one exact canonical product.
- `review-required`: no wardrobe mutation has occurred.
- `confirmed`: an exact product and the explicit correction fields were added
  to a new wardrobe snapshot version.
- `rejected`: the candidate remains in local fixture history but adds nothing.

## Field evidence

Every product, brand, category, color, and size/fit field carries:

- value;
- provenance;
- confidence.

Camera-fixture values use `simulated-camera-inference` and confidence below
`1`. User corrections use `explicit-user-correction`, confidence `1`, and a
versioned correction ID. Explicit correction always outranks inference.

## Fail-closed rules

- Personalization consent is required for start, correction, rejection, and
  confirmation.
- Simulated camera suggestions never carry an exact `productId`.
- Similar, ambiguous, unknown, and uncorrected suggested candidates cannot be
  confirmed.
- Correction must select a canonical `Exact item`.
- Duplicate canonical items remain blocked.
- Only confirmation advances the wardrobe snapshot.
- Public/extension decision requests receive the canonical wardrobe reference,
  not raw capture input, inference fields, or correction history.

## Data lifecycle

Capture records are browser-local fixture data. Export contains their complete
versioned history. Completed deletion and deterministic reset remove every
capture record along with profile, consent, fit, and wardrobe data.

## Verification

- 549 deterministic repository tests.
- Deterministic manual, suggested, ambiguous, unknown, correction, confirmation,
  rejection, duplicate, export, deletion, and reset tests.
- Route/privacy regression proving there is no media API, file input, capture
  attribute, image reader, or canvas export.
- Browser QA verifies suggestion → explicit correction → confirmation,
  ambiguous rejection, immediate consent revocation, and a clean console.

## Production gates

No camera permission, real photo, upload, OCR/vision provider, production
storage, analytics, personal data, extension permission, paid call, or likeness
workflow is authorized. Provider selection, retention policy, photo privacy,
biometric/likeness analysis, and legal review remain founder-controlled gates.
