/**
 * Minimal method + path router.
 *
 * Patterns are literal segments plus `:name` params — enough for this product
 * and small enough to read in one sitting, which is the point of having no
 * framework in the dependency tree.
 */

function compile(pattern) {
  const segments = pattern.split("/").filter(Boolean);
  return {
    segments,
    params: segments.filter((segment) => segment.startsWith(":")).map((segment) => segment.slice(1)),
  };
}

function matchSegments(compiled, segments) {
  if (compiled.segments.length !== segments.length) return null;

  const params = {};
  for (let index = 0; index < segments.length; index += 1) {
    const expected = compiled.segments[index];
    const actual = segments[index];
    if (expected.startsWith(":")) {
      if (!actual) return null;
      params[expected.slice(1)] = actual;
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

export function createRouter({ basePath = "" } = {}) {
  const routes = [];

  function add(method, pattern, handler) {
    routes.push({ method: method.toUpperCase(), pattern, compiled: compile(pattern), handler });
    return api;
  }

  /**
   * Returns the matched route, or `{ handler: null, allowed }` when the path
   * exists under a different method so the caller can answer 405 rather than a
   * misleading 404.
   */
  function match(method, pathname) {
    const normalisedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const withoutBase = basePath && normalisedPath.startsWith(basePath)
      ? normalisedPath.slice(basePath.length) || "/"
      : normalisedPath;
    const segments = withoutBase.split("/").filter(Boolean);

    const allowed = new Set();
    for (const route of routes) {
      const params = matchSegments(route.compiled, segments);
      if (!params) continue;
      if (route.method === method.toUpperCase()) return { handler: route.handler, params, route };
      allowed.add(route.method);
    }

    return { handler: null, params: {}, allowed: [...allowed] };
  }

  const api = {
    add,
    get: (pattern, handler) => add("GET", pattern, handler),
    post: (pattern, handler) => add("POST", pattern, handler),
    match,
    routes,
  };

  return api;
}

export default createRouter;
