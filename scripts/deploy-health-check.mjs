// Post-deploy health check (issue #17, section 4). Pure decision
// functions plus a thin fetch-based checker — no headless browser, no
// npm dependency (this repo has no package manager, per CLAUDE.md).
// Console-error/unresolved-binding detection works by grepping the
// served HTML for the dc-runtime's own warning string, since that
// runtime already logs an explicit, greppable marker for every
// unresolved `{{ }}` binding (CLAUDE.md "Verifying a change").
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md

// The runtime logs to the browser console, not the response body, so a
// plain fetch can't see it directly — but every unresolved binding also
// leaves the literal `{{ field }}` text unrendered in the HTML (the
// runtime never strips a binding it couldn't resolve). Grepping for that
// is a deterministic, dependency-free proxy for the same signal without
// needing a real browser.
const UNRESOLVED_BINDING_RE = /\{\{\s*[\w.]+\s*\}\}/;

/**
 * Fetches one route and evaluates it against the deterministic checks
 * this repo can run without a browser: HTTP status, presence of a
 * `<title>`, and no leftover unresolved `{{ }}` binding text.
 */
export async function checkRoute(baseUrl, route, { fetchImpl = fetch } = {}) {
  const url = new URL(route, baseUrl).toString();
  try {
    const res = await fetchImpl(url);
    const body = await res.text();
    const problems = [];
    if (!res.ok) problems.push(`HTTP ${res.status}`);
    if (!/<title>[^<]+<\/title>/i.test(body)) problems.push('missing <title>');
    const unresolvedMatch = body.match(UNRESOLVED_BINDING_RE);
    if (unresolvedMatch) problems.push(`unresolved binding rendered as literal text: "${unresolvedMatch[0]}"`);
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
  '/',
  '/guides.html',
  '/shop.html',
  '/products.html',
  '/about.html',
]);
