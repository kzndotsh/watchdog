import { describe, expect, it, vi } from "vitest";

const createAppQueryClientMock = vi.hoisted(() => vi.fn(() => ({ id: "qc" })));
const createTanStackRouterMock = vi.hoisted(() =>
  vi.fn(() => ({ id: "router" }))
);

vi.mock("../routeTree.gen", () => ({
  routeTree: { id: "tree" },
}));

vi.mock("@/app/lib/query-client", () => ({
  createAppQueryClient: createAppQueryClientMock,
}));

vi.mock("@tanstack/react-router", () => ({
  createRouter: createTanStackRouterMock,
}));

import { getRouter } from "@/router";

describe("getRouter", () => {
  it("creates a TanStack router that wraps the app in its QueryClient", () => {
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
        Wrap: expect.any(Function),
      })
    );
    expect(router).toEqual({ id: "router" });
  });
});
