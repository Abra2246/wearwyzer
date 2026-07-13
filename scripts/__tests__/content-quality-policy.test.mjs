import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAudienceConsistency,
  checkEditorialStructure,
  checkOutfitDiversity,
  checkCarouselDimensions,
  checkAssetNamingAndExistence,
  reportAffiliateCoverage,
  isEligibleForPublicRecommendation,
  runContentQualityPolicy,
  MIN_OUTFITS,
} from '../content-quality-policy.mjs';

test('checkAudienceConsistency rejects a missing/unknown gender', () => {
  assert.ok(checkAudienceConsistency({ audience: {} }).length > 0);
  assert.ok(checkAudienceConsistency({ audience: { gender: 'other-unspecified' } }).length > 0);
  assert.equal(checkAudienceConsistency({ audience: { gender: 'unisex' } }).length, 0);
});

test('checkEditorialStructure requires the minimum outfit count and full outfit fields', () => {
  const tooFew = { outfits: [{ name: 'A', when: 'x', why: 'y', items: [{ productId: 'p1' }] }] };
  const violations = checkEditorialStructure(tooFew);
  assert.ok(violations.some((v) => v.includes(`minimum is ${MIN_OUTFITS}`)));
});

test('checkEditorialStructure flags an outfit missing why/items', () => {
  const guide = { outfits: [
    { name: 'A', when: 'x' }, // missing why + items
    { name: 'B', when: 'x', why: 'y', items: [{ productId: 'p1' }] },
    { name: 'C', when: 'x', why: 'y', items: [{ productId: 'p2' }] },
  ] };
  const violations = checkEditorialStructure(guide);
  assert.ok(violations.some((v) => v.includes('"A"') && v.includes('why')));
  assert.ok(violations.some((v) => v.includes('"A"') && v.includes('items')));
});

test('checkOutfitDiversity rejects identical item sets and repeated "when" contexts', () => {
  const guide = {
    outfits: [
      { name: 'A', when: 'Weekday', items: [{ productId: 'p1' }, { productId: 'p2' }] },
      { name: 'B', when: 'Weekday', items: [{ productId: 'p2' }, { productId: 'p1' }] },
    ],
  };
  const violations = checkOutfitDiversity(guide);
  assert.ok(violations.some((v) => v.includes('identical item set')));
  assert.ok(violations.some((v) => v.includes('"when" context')));
});

test('checkCarouselDimensions enforces slide count bounds and mobile-safe aspect ratio', () => {
  const tooFewSlides = [{ order: 1, width: 1080, height: 1350 }];
  assert.ok(checkCarouselDimensions(tooFewSlides).some((v) => v.includes('between')));

  const badRatio = Array.from({ length: 4 }, (_, i) => ({ order: i + 1, width: 1000, height: 400 }));
  assert.ok(checkCarouselDimensions(badRatio).some((v) => v.includes('aspect ratio')));

  const good = Array.from({ length: 4 }, (_, i) => ({ order: i + 1, width: 1080, height: 1350 }));
  assert.equal(checkCarouselDimensions(good).length, 0);
});

test('checkAssetNamingAndExistence rejects an asset that failed to render', () => {
  const guideRecord = { slideImages: [{ src: 'assets/images/guides/x/slide-01.svg', label: 'Cover' }] };
  const violations = checkAssetNamingAndExistence(guideRecord, [{ slideOrder: 1, status: 'blocked' }]);
  assert.ok(violations.some((v) => v.includes('no rendered asset')));
});

test('checkAssetNamingAndExistence rejects a non-conforming asset path', () => {
  const guideRecord = { slideImages: [{ src: 'assets/images/guides/x/weird-name.svg', label: 'Cover' }] };
  const violations = checkAssetNamingAndExistence(guideRecord, [{ slideOrder: 1, status: 'rendered' }]);
  assert.ok(violations.some((v) => v.includes('naming convention')));
});

test('reportAffiliateCoverage is informational and never throws on an empty product list', () => {
  assert.deepEqual(reportAffiliateCoverage([]), { total: 0, withAffiliateLink: 0, coverageRatio: 0 });
  const report = reportAffiliateCoverage([{ affiliateUrl: 'x' }, { affiliateUrl: '' }]);
  assert.equal(report.total, 2);
  assert.equal(report.withAffiliateLink, 1);
  assert.equal(report.coverageRatio, 0.5);
});

test('isEligibleForPublicRecommendation matches the Knowledge Graph rule', () => {
  assert.equal(isEligibleForPublicRecommendation({ verificationStatus: 'verified', confidence: 'editorial' }), true);
  assert.equal(isEligibleForPublicRecommendation({ verificationStatus: 'draft', confidence: 'verified' }), false);
  assert.equal(isEligibleForPublicRecommendation({ verificationStatus: 'verified', confidence: 'unverified' }), false);
});

test('runContentQualityPolicy passes for a well-formed guide and reports affiliate coverage without blocking', () => {
  const manifest = { audience: { gender: 'men' } };
  const guideRecord = {
    outfits: [
      { name: 'A', when: 'Weekday', why: 'y', items: [{ productId: 'p1' }] },
      { name: 'B', when: 'Weekend', why: 'y', items: [{ productId: 'p2' }] },
      { name: 'C', when: 'Evening', why: 'y', items: [{ productId: 'p3' }] },
    ],
    slideImages: [
      { src: 'assets/images/guides/x/slide-01.svg', label: 'Cover' },
      { src: 'assets/images/guides/x/slide-02.svg', label: 'A' },
      { src: 'assets/images/guides/x/slide-03.svg', label: 'B' },
      { src: 'assets/images/guides/x/slide-04.svg', label: 'C' },
    ],
  };
  const slideSpecs = [1, 2, 3, 4].map((order) => ({ order, width: 1080, height: 1350 }));
  const renderedAssets = [1, 2, 3, 4].map((slideOrder) => ({ slideOrder, status: 'rendered' }));
  const result = runContentQualityPolicy({ manifest, guideRecord, productRecords: [{ affiliateUrl: '' }], slideSpecs, renderedAssets });
  assert.equal(result.passed, true, JSON.stringify(result.blockingViolations));
  assert.equal(result.affiliateCoverage.coverageRatio, 0);
});
