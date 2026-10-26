function isRouteHook(value: unknown): value is (ctx: object) => unknown {
  return typeof value === "function";
}

/**
 * Calls a route's `beforeLoad` / `loader` with only the context fields the test cares
 * about. The router's full context type (matches, abort signal, cause, ...) is not what a
 * route test exercises, so the loose call lives here once instead of a cast at every call.
 */
export function callRouteHook(hook: unknown, ctx: object): unknown {
  if (!isRouteHook(hook)) throw new Error("The route has no such hook");
  return hook(ctx);
}
