import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { RouteError } from "@/shared/layout/route-error";
import { createAppQueryClient } from "@/shared/lib/query-client";
import { DefaultRoutePendingShell } from "@/shared/ui/default-route-pending-shell";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = createAppQueryClient();

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    // Scroll lives on <Page overflow-y-auto>, not window. TanStack restoration
    // snapshots inner scroll targets into sessionStorage; programmatic scroll-to-top
    // after render does not update those entries, so refresh alternates middle → top.
    scrollRestoration: false,
    defaultPreload: "intent",
    // Let Query own cache freshness.
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 400,
    defaultPendingMinMs: 500,
    defaultPendingComponent: DefaultRoutePendingShell,
    defaultErrorComponent: RouteError,
    defaultStructuralSharing: true,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    handleRedirects: true,
    wrapQueryClient: true,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
