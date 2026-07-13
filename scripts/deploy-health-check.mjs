// Post-deploy health check (issue #17, section 4). Pure decision
// functions plus a thin fetch-based checker — no headless browser, no
// npm dependency (this repo has no package manager, per CLAUDE.md).
//
// Important: the deployed `.dc.html` files intentionally contain runtime
// bindings such as `{{ q }}` in their source. A plain HTTP fetch sees the
// pre-runtime template, not the browser-rendered DOM, so unresolved-binding
// detection belongs in the existing static/browser validation pipeline, not
// in this fetch-only production check.
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/**
 * Fetches one route and evaluates checks that are valid from raw HTTP:
 * response status and presence of a non-empty page title.
 */
export async function checkRoute(baseUrl, route, { fetchImpl = fetch } = {}) {
  const normalizedRoute = String(route).replace(/^\/+/, '');
  const url = new URL(normalizedRoute, normalizeBaseUrl(baseUrl)).toString();
  try {
    const res = await fetchImpl(url);
    const body = await res.text();
    const problems = [];
    if (!res.ok) problems.push(`HTTP ${res.status}`);
    if (!/<title>[^<]+<\/title>/i.test(body)) problems.push('missing <title>');
    return { route, url, ok: problems.length === 0, status: res.status, problems };
  } catch (err) {
    return { route, url, ok: false, status: null, problems: [`fetch failed: ${err.message}`] };
  }
}

export async function checkRoutes(baseUrl, routes, options = {}) {
  return Promise.all(routes.map((route) => checkRoute(baseUrl, route, options)));
}

/** Pure aggregation: healthy only if every route checked out clean. */
export function evaluateDeploymentHealth(routeResults) {
  const failed = (routeResults || []).filter((r) => !r.ok);
  return {
    healthy: failed.length === 0,
    checkedCount: (routeResults || []).length,
    failedRoutes: failed,
  };
}

export const DEFAULT_CRITICAL_ROUTES = Object.freeze([
  'index.dc.html',
  'guides.dc.html',
  'shop.dc.html',
  'products.dc.html',
]);
