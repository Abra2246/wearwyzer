import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRoute, checkRoutes, evaluateDeploymentHealth } from '../deploy-health-check.mjs';

function fakeFetch(responses) {
  return async (url) => {
    const key = new URL(url).pathname;
    const entry = responses[key];
    if (!entry) throw new Error(`no fake response configured for ${key}`);
    return { ok: entry.status < 400, status: entry.status, text: async () => entry.body };
  };
}

test('checkRoute passes for a healthy 200 page with a title', async () => {
  const fetchImpl = fakeFetch({ '/': { status: 200, body: '<html><head><title>Home</title></head></html>' } });
  const result = await checkRoute('https://example.com', '/', { fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test('checkRoute fails on a non-2xx status', async () => {
  const fetchImpl = fakeFetch({ '/broken': { status: 500, body: '<html><head><title>Error</title></head></html>' } });
  const result = await checkRoute('https://example.com', '/broken', { fetchImpl });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('500')));
});

test('checkRoute fails when the page is missing a <title>', async () => {
  const fetchImpl = fakeFetch({ '/': { status: 200, body: '<html><head></head></html>' } });
  const result = await checkRoute('https://example.com', '/', { fetchImpl });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('title')));
});

test('checkRoute does not treat raw dc-runtime bindings as a fetch-only production failure', async () => {
  const fetchImpl = fakeFetch({
    '/guide.dc.html': { status: 200, body: '<html><head><title>Guide</title></head><body>{{ verdict }}</body></html>' },
  });
  const result = await checkRoute('https://example.com', '/guide.dc.html', { fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test('checkRoute reports a fetch failure without throwing', async () => {
  const fetchImpl = async () => {
    throw new Error('network down');
  };
  const result = await checkRoute('https://example.com', '/', { fetchImpl });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('network down')));
});

test('checkRoutes / evaluateDeploymentHealth: all healthy routes -> healthy deployment', async () => {
  const fetchImpl = fakeFetch({
    '/': { status: 200, body: '<title>Home</title>' },
    '/shop.html': { status: 200, body: '<title>Shop</title>' },
  });
  const results = await checkRoutes('https://example.com', ['/', '/shop.html'], { fetchImpl });
  const health = evaluateDeploymentHealth(results);
  assert.equal(health.healthy, true);
  assert.equal(health.checkedCount, 2);
});

test('checkRoutes / evaluateDeploymentHealth: one failing route -> unhealthy deployment', async () => {
  const fetchImpl = fakeFetch({
    '/': { status: 200, body: '<title>Home</title>' },
    '/shop.html': { status: 500, body: '' },
  });
  const results = await checkRoutes('https://example.com', ['/', '/shop.html'], { fetchImpl });
  const health = evaluateDeploymentHealth(results);
  assert.equal(health.healthy, false);
  assert.equal(health.failedRoutes.length, 1);
  assert.equal(health.failedRoutes[0].route, '/shop.html');
});
