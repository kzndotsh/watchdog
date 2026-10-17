import {
  RouterContextProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * A real router (memory history, two routes: `/` and `/elsewhere`) for a component or hook
 * that reads the router (`useBlocker`, `useNavigate`) but whose routes are not under test.
 * Pair with `testRouterWrapper` as the Testing Library `wrapper`, then drive a navigation
 * with `router.history.push("/elsewhere")` and read `router.history.location.pathname`.
 * `"browser"` history listens for `beforeunload` on `window`: the test must call
 * `destroyTestRouter(router)` when it ends.
 */
export function createTestRouter(history: "memory" | "browser" = "memory") {
  const root = createRootRoute();
  const home = createRoute({ getParentRoute: () => root, path: "/" });
  const elsewhere = createRoute({
    getParentRoute: () => root,
    path: "/elsewhere",
  });
  return createRouter({
    routeTree: root.addChildren([home, elsewhere]),
    history:
      history === "browser"
        ? createBrowserHistory()
        : createMemoryHistory({ initialEntries: ["/"] }),
  });
}

/** The Testing Library `wrapper` that gives the tree `router`; `rerender` keeps it. */
export function testRouterWrapper(router: ReturnType<typeof createTestRouter>) {
  return function TestRouterWrapper({ children }: { children: ReactNode }) {
    return (
      <RouterContextProvider router={router}>{children}</RouterContextProvider>
    );
  };
}

/**
 * Detaches a router's history from `window`. Browser history patches `history.pushState` and
 * `replaceState` as own properties and its `destroy` assigns the originals back as own
 * properties, so they are deleted here to leave `window.history` as it was (leak canary).
 */
export function destroyTestRouter(router: ReturnType<typeof createTestRouter>) {
  router.history.destroy();
  Reflect.deleteProperty(window.history, "pushState");
  Reflect.deleteProperty(window.history, "replaceState");
}
