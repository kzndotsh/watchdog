import "@/lib/zod-jitless";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { requestCspNonce } from "@/lib/csp-nonce";
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
    // The CSP nonce Start puts on every script and style it emits.
    ssr: { nonce: requestCspNonce() },
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
  // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation merges only as an interface
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
