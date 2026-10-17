import type { AnyRoute } from "@tanstack/react-router";

type Mount = { id: string; path: string; getParentRoute: () => AnyRoute };

/**
 * Hangs a file route (`createFileRoute("/_protected/collect/")`) at a path in a small
 * test router, the way the generated `routeTree.gen.ts` does: `update` takes the id and
 * path there, but its public type only admits the updatable options.
 */
export function mountFileRoute(route: AnyRoute, mount: Mount): AnyRoute {
  // oxlint-disable-next-line typescript/no-unsafe-return -- Reflect.apply is untyped; `update` returns the route
  return Reflect.apply(route.update, route, [mount]);
}
