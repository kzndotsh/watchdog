import "@/lib/zod-jitless";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { createAppQueryClient } from "@/app/lib/query-client";
import { requestCspNonce } from "@/lib/csp-nonce";
import { RouteError } from "@/shared/layout/route-error";
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
    // The CSP nonce Start puts on every script and style of the document shell it still renders.
    ssr: { nonce: requestCspNonce() },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
}

declare module "@tanstack/react-router" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation merges only as an interface
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
