# adidas Samba OG B75806 production pilot

**Issue:** #62  
**Status:** ready for review; not published  
**Verified:** July 23, 2026 at 20:25 UTC  
**Spend:** $0.00

## Verified hero evidence

- Official source: <https://www.adidas.com/us/samba-og-shoes/B75806.html>
- Product: adidas Samba OG Shoes
- Product code: B75806
- Colorway: Cloud White / Core Black / gum
- Displayed price at verification: $100
- Availability evidence: the official page exposed an Add to bag action
- Fit guidance: the official page recommended the usual size

The canonical product record retains the source URL, verification timestamp, price source,
availability state, and fit guidance. Affiliate status is `unverified` and `affiliateUrl` remains
empty; the pilot does not infer a partnership from adidas's public affiliate footer.

## Editorial output

- Audience: menswear-first
- Concept: “5 ways to wear Sambas without looking like everyone else”
- Five distinct outfits:
  1. Clean Summer Uniform
  2. Relaxed Creative Office
  3. Terrace Influence, Grown Up
  4. Minimal Evening
  5. Weekend City Utility
- Seven 1080×1350 deterministic SVG slides:
  - product-led cover;
  - one styling formula per outfit slide;
  - one honest recap/affiliate-disclosure slide.
- The same exact hero product appears in every outfit.
- No paid image generation, social publishing, or public deployment was attempted.

The deterministic assets prove content structure, aspect ratio, naming, persistence, and page
integration. They are not presented as finished photoreal editorial imagery.

## Affiliate review

- Target: at least 80% verified affiliate-enabled products.
- Actual guide coverage: 0 of 20 item placements, 0%.
- Portfolio coverage after the pilot: 0 of 83 item placements, 0%.
- Reason: the link engine has no configured retailer or affiliate-network adapters.
- Result: failed KPI, reported honestly, non-blocking for editorial review.

Supporting items were selected for styling quality first. Existing records from
Abercrombie & Fitch and Gap were preferred where they strengthened the outfits, but neither was
counted as affiliate-enabled without a verified offer.

## Idempotency and report freshness

The production writer was executed twice with the same fixed verification time:

- first production pass: guide/product/relationship/sitemap records and eight assets persisted;
- repeat pass: zero content changes, zero asset rewrites, eight assets verified and skipped.

The repeat exposed and fixed a cache-boundary defect: the writer's same-process link-engine refresh
could reuse the pre-write Knowledge Graph and omit the new guide. The writer now starts the link
engine in a fresh process and fails closed if the report cannot be regenerated. The persisted report
includes this Samba guide.

## Review gates

- Review copy, menswear positioning, and five outfit formulas.
- Confirm deterministic assets are acceptable as pipeline evidence only.
- Do not merge as publish-ready creative imagery.
- Do not enable paid image calls, affiliate credentials, deployment, or social publishing without
  the corresponding approval.
