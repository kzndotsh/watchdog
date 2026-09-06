import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (_handler: () => unknown) => ({
      client: (clientHandler: () => Promise<unknown>) => async () =>
        clientHandler(),
    }),
  }),
}));

vi.mock("@better-auth-ui/core", () => ({
  sessionOptions: vi.fn(() => ({ queryKey: ["session"], queryFn: vi.fn() })),
}));

vi.mock("@/auth/client", () => ({
  authClient: {},
}));

import { sessionOptions } from "@better-auth-ui/core";

import { ensureAppSession } from "@/auth/ensure-session";

describe("ensureAppSession", () => {
  it("client path fetches the session query with staleTime 0", async () => {
    query.mockResolvedValue({ user: { id: "user-1" } });
    const queryClient = { query } as unknown as QueryClient;

    await ensureAppSession(queryClient);

    expect(sessionOptions).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ staleTime: 0 })
    );
  });
});
