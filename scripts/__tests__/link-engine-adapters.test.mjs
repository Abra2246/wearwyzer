import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixtureAdapter, createHttpProviderAdapter, isAdapterUsable, readAdapterCredentialFromEnv, ADAPTER_KINDS } from '../link-engine-adapters.mjs';

test('createFixtureAdapter rejects an unknown adapter kind', () => {
  assert.throws(() => createFixtureAdapter({ id: 'x', kind: 'not-a-kind', name: 'x', listings: [] }), /unknown adapter kind/);
});

test('fixture adapter search filters by category and stamps adapterId', async () => {
  const adapter = createFixtureAdapter({
    id: 'fx',
    kind: 'retailer',
    name: 'Fixture Retailer',
    listings: [
      { listingId: 'a', category: 'belts' },
      { listingId: 'b', category: 'hats' },
    ],
  });
  const results = await adapter.search({ category: 'belts' });
  assert.equal(results.length, 1);
  assert.equal(results[0].listingId, 'a');
  assert.equal(results[0].adapterId, 'fx');
});

test('fixture adapter search with no category returns every listing', async () => {
  const adapter = createFixtureAdapter({
    id: 'fx',
    kind: 'brand-site',
    name: 'Fixture Brand',
    listings: [{ listingId: 'a', category: 'belts' }, { listingId: 'b', category: 'hats' }],
  });
  const results = await adapter.search({});
  assert.equal(results.length, 2);
});

test('fixture adapter verify returns null for an unknown listingId (delisted)', async () => {
  const adapter = createFixtureAdapter({ id: 'fx', kind: 'retailer', name: 'Fixture', listings: [{ listingId: 'a' }] });
  assert.equal(await adapter.verify('does-not-exist'), null);
});

test('fixture adapter verify returns the listing with adapterId stamped', async () => {
  const adapter = createFixtureAdapter({ id: 'fx', kind: 'retailer', name: 'Fixture', listings: [{ listingId: 'a', price: 10 }] });
  const result = await adapter.verify('a');
  assert.equal(result.price, 10);
  assert.equal(result.adapterId, 'fx');
});

test('http-provider adapter is always blocked without a credential — never fabricates a listing', async () => {
  const adapter = createHttpProviderAdapter({ id: 'real-retailer', kind: 'retailer', name: 'Real Retailer', env: {} });
  const searchResult = await adapter.search({});
  assert.equal(searchResult.blocked, true);
  assert.equal(searchResult.errorType, 'missing_credential');
  assert.match(searchResult.reason, /no credential configured/);

  const verifyResult = await adapter.verify('anything');
  assert.equal(verifyResult.blocked, true);
});

test('http-provider adapter reads its credential only from the given env, keyed per adapter id', () => {
  const env = { LINK_ENGINE_CREDENTIAL_MY_RETAILER: 'secret-value' };
  assert.equal(readAdapterCredentialFromEnv('my-retailer', env), 'secret-value');
  assert.equal(readAdapterCredentialFromEnv('other-retailer', env), null);
});

test('http-provider adapter with a configured credential still refuses (no live integration is implemented in this repo)', async () => {
  const env = { LINK_ENGINE_CREDENTIAL_REAL_RETAILER: 'secret-value' };
  const adapter = createHttpProviderAdapter({ id: 'real-retailer', kind: 'retailer', name: 'Real Retailer', env });
  assert.equal(adapter.isConfigured, true);
  const result = await adapter.search({});
  assert.equal(result.blocked, true);
  assert.equal(result.errorType, 'not_implemented');
});

test('isAdapterUsable is true for fixture adapters and false for unconfigured http-provider adapters', () => {
  const fixture = createFixtureAdapter({ id: 'fx', kind: 'retailer', name: 'Fixture', listings: [] });
  const httpProvider = createHttpProviderAdapter({ id: 'real', kind: 'retailer', name: 'Real', env: {} });
  assert.equal(isAdapterUsable(fixture), true);
  assert.equal(isAdapterUsable(httpProvider), false);
  assert.equal(isAdapterUsable(null), false);
});

test('every adapter kind used in this repo is a recognized kind', () => {
  for (const kind of ['brand-site', 'retailer', 'affiliate-network', 'product-feed']) {
    assert.ok(ADAPTER_KINDS.includes(kind));
  }
});
