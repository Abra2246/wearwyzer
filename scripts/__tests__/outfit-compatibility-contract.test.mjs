import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OUTFIT_COMPATIBILITY_VERSION,
  compareOutfitCompatibility,
  evaluateOutfitCompatibility,
  serializeOutfitCompatibility,
} from '../outfit-compatibility-contract.mjs';

function signal(dimension, value, overrides = {}) {
  return {
    dimension,
    value,
    sentiment: 'positive',
    source: 'explicit-user',
    confidence: 1,
    evidenceCode: 'explicit-user-selection',
    ...overrides,
  };
}

function item(itemId, productId, ownership, role, overrides = {}) {
  return {
    itemId,
    productId,
    ownership,
    role,
    evidenceState: 'current',
    aesthetics: ['minimal'],
    palette: ['navy'],
    silhouette: 'relaxed',
    formality: 'smart-casual',
    materials: ['cotton'],
    occasions: ['everyday'],
    seasons: ['transitional'],
    layering: role === 'outerwear' ? 'outer-layer' : 'base',
    riskLevel: 'balanced',
    fitStatus: role === 'accessory' ? 'not-applicable' : 'verified',
    ...overrides,
  };
}

function base(overrides = {}) {
  return {
    outfitId: 'fixture-outfit-one',
    evidenceVersion: 1,
    styleDnaVersion: 'style-dna-v1',
    styleSignals: [
      signal('palette', 'navy'),
      signal('silhouette', 'relaxed'),
      signal('formality', 'smart-casual'),
      signal('material', 'cotton'),
      signal('layering', 'outer-layer'),
    ],
    target: { occasion: 'everyday', season: 'transitional' },
    items: [
      item('owned-top', 'fixture-top', 'owned', 'top'),
      item('owned-bottom', 'fixture-bottom', 'owned', 'bottom'),
      item('prospective-shoe', 'fixture-shoe', 'prospective', 'footwear'),
      item('owned-jacket', 'fixture-jacket', 'owned', 'outerwear'),
    ],
    ...overrides,
  };
}

test('compatible outfit returns decomposed evidence and item ownership', () => {
  const result = evaluateOutfitCompatibility(base()).result;
  assert.equal(result.schemaVersion, OUTFIT_COMPATIBILITY_VERSION);
  assert.equal(result.status, 'compatible');
  assert.ok(result.score >= 80);
  assert.deepEqual(Object.keys(result.parts), [
    'palette',
    'silhouette',
    'formality',
    'material',
    'occasion',
    'layering',
    'verifiedFit',
    'ownedPairing',
  ]);
  assert.deepEqual(result.items.map(({ ownership }) => ownership), [
    'owned',
    'owned',
    'prospective',
    'owned',
  ]);
});

test('explicit negative Style DNA signal is a hard block', () => {
  const result = evaluateOutfitCompatibility(base({
    styleSignals: [
      signal('palette', 'navy', { sentiment: 'negative' }),
    ],
  })).result;
  assert.equal(result.status, 'incompatible');
  assert.equal(result.score, null);
  assert.ok(result.hardIncompatibilities.every((reason) => reason.includes('explicit-negative-palette')));
});

test('inferred negative signal remains opposing evidence but cannot hard block', () => {
  const result = evaluateOutfitCompatibility(base({
    styleSignals: [
      signal('palette', 'navy', {
        sentiment: 'negative',
        source: 'inferred',
        confidence: 0.8,
        evidenceCode: 'owned-style-summary',
      }),
      signal('silhouette', 'relaxed'),
    ],
  })).result;
  assert.notEqual(result.status, 'incompatible');
  assert.ok(result.reasonCodes.includes('inferred-negative-palette-not-a-hard-block'));
});

test('missing evidence lowers confidence instead of compatibility score', () => {
  const current = evaluateOutfitCompatibility(base()).result;
  const unknownFit = evaluateOutfitCompatibility(base({
    items: base().items.map((record) => (
      record.role === 'footwear' ? { ...record, fitStatus: 'unknown' } : record
    )),
  })).result;
  assert.equal(unknownFit.status, 'review-required');
  assert.equal(unknownFit.parts.verifiedFit, null);
  assert.ok(unknownFit.missingEvidence.includes('prospective-shoe:fit-evidence-unknown'));
  assert.ok(unknownFit.evidenceCoverage < current.evidenceCoverage);
  assert.notEqual(unknownFit.score, 0);
});

test('conflicting fit and unsupported target facts fail hard', () => {
  const result = evaluateOutfitCompatibility(base({
    items: base().items.map((record) => {
      if (record.role === 'footwear') {
        return {
          ...record,
          fitStatus: 'conflicting',
          occasions: ['formal'],
          seasons: ['winter'],
        };
      }
      return record;
    }),
  })).result;
  assert.equal(result.status, 'incompatible');
  assert.ok(result.hardIncompatibilities.includes('prospective-shoe:fit-evidence-conflicting'));
  assert.ok(result.hardIncompatibilities.includes('prospective-shoe:target-occasion-unsupported'));
  assert.ok(result.hardIncompatibilities.includes('prospective-shoe:target-season-unsupported'));
});

test('a missing required-role item stays labeled and cannot form a complete outfit', () => {
  const result = evaluateOutfitCompatibility(base({
    items: base().items.map((record) => (
      record.role === 'bottom' ? { ...record, ownership: 'missing' } : record
    )),
  })).result;
  assert.equal(result.status, 'incompatible');
  assert.ok(result.hardIncompatibilities.includes('owned-bottom:required-role-not-owned-or-prospective'));
  assert.equal(result.items.find(({ role }) => role === 'bottom').ownership, 'missing');
});

test('product evidence state remains visible and lowers confidence', () => {
  const result = evaluateOutfitCompatibility(base({
    items: base().items.map((record) => (
      record.role === 'outerwear' ? { ...record, evidenceState: 'stale' } : record
    )),
  })).result;
  assert.equal(result.status, 'review-required');
  assert.ok(result.missingEvidence.includes('owned-jacket:product-evidence-stale'));
  assert.equal(result.items.find(({ role }) => role === 'outerwear').evidenceState, 'stale');
});

test('comparison selects a leader, preserves ties, and reports none qualified', () => {
  const weaker = base({
    outfitId: 'fixture-outfit-two',
    items: base().items.map((record) => ({
      ...record,
      palette: ['cream'],
      silhouette: 'straight',
    })),
  });
  const selected = compareOutfitCompatibility([base(), weaker]).result;
  assert.equal(selected.status, 'selected');
  assert.deepEqual(selected.selectedOutfitIds, ['fixture-outfit-one']);
  const tied = compareOutfitCompatibility([
    base(),
    base({ outfitId: 'fixture-outfit-tie' }),
  ]).result;
  assert.equal(tied.status, 'tie');
  assert.deepEqual(tied.selectedOutfitIds, ['fixture-outfit-one', 'fixture-outfit-tie']);
  const blocked = base({
    styleSignals: [signal('palette', 'navy', { sentiment: 'negative' })],
  });
  const none = compareOutfitCompatibility([
    blocked,
    { ...blocked, outfitId: 'fixture-outfit-blocked-two' },
  ]).result;
  assert.equal(none.status, 'none-qualified');
  assert.deepEqual(none.selectedOutfitIds, []);
});

test('invalid, duplicate, private, and commercial evidence fails closed', () => {
  const invalid = [
    base({ affiliateCommission: 8 }),
    base({ items: base().items.slice(0, 2) }),
    base({ items: base().items.map((record, index) => (
      index === 1 ? { ...record, itemId: 'owned-top' } : record
    )) }),
    base({ styleSignals: [signal('income', 'high')] }),
    base({ items: base().items.map((record) => (
      record.role === 'footwear' ? { ...record, price: 120 } : record
    )) }),
  ];
  for (const input of invalid) assert.equal(evaluateOutfitCompatibility(input).ok, false);
});

test('policy keeps fit and truth above preference and excludes commerce', () => {
  const policy = evaluateOutfitCompatibility(base()).result.policy;
  assert.equal(policy.explicitNegativeSignalsMayBlock, true);
  assert.equal(policy.inferredNegativeSignalsMayBlock, false);
  assert.equal(policy.missingEvidenceLowersConfidence, true);
  assert.equal(policy.fitAndProductTruthOutrankPreference, true);
  assert.equal(policy.commercialInfluenceAllowed, false);
});

test('minimized output excludes private profile, wardrobe, and commerce data', () => {
  const serialized = JSON.stringify(evaluateOutfitCompatibility(base()).result);
  assert.doesNotMatch(
    serialized,
    /profile|wardrobe|privateNote|browsing|purchase|return|price|retailer|affiliate|commission|popularity|account/i,
  );
});

test('identical evidence serializes byte-stably', () => {
  const result = evaluateOutfitCompatibility(base()).result;
  assert.equal(
    serializeOutfitCompatibility(result),
    serializeOutfitCompatibility(structuredClone(result)),
  );
});
