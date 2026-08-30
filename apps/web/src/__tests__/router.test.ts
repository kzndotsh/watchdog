import { describe, expect, it, vi } from "vitest";

const createAppQueryClientMock = vi.hoisted(() => vi.fn(() => ({ id: "qc" })));
const createTanStackRouterMock = vi.hoisted(() =>
  vi.fn(() => ({ id: "router" }))
);
const setupRouterSsrQueryIntegrationMock = vi.hoisted(() => vi.fn());

vi.mock("../routeTree.gen", () => ({
  routeTree: { id: "tree" },
}));

vi.mock("@/shared/lib/query-client", () => ({
  createAppQueryClient: createAppQueryClientMock,
}));

vi.mock("@tanstack/react-router", () => ({
  createRouter: createTanStackRouterMock,
}));

vi.mock("@tanstack/react-router-ssr-query", () => ({
  setupRouterSsrQueryIntegration: setupRouterSsrQueryIntegrationMock,
}));

import { getRouter } from "@/router";

describe("getRouter", () => {
  it("creates a TanStack router with SSR query integration", () => {
    const router = getRouter();

    expect(createAppQueryClientMock).toHaveBeenCalledTimes(1);
    expect(createTanStackRouterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scrollRestoration: false,
        defaultPreload: "intent",
        defaultPreloadStaleTime: 0,
        defaultPendingMs: 400,
        defaultPendingMinMs: 500,
        defaultStructuralSharing: true,
        context: { queryClient: { id: "qc" } },
      })
    );
    expect(setupRouterSsrQueryIntegrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        router,
        queryClient: { id: "qc" },
        handleRedirects: true,
        wrapQueryClient: true,
      })
    );
    expect(router).toEqual({ id: "router" });
  });
});
