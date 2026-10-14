import type { Query, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const query = vi.fn();
const getQueryData = vi.fn();

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
import { STALE_SESSION } from "@/shared/lib/query-stale";

const queryClient = { query, getQueryData } as unknown as QueryClient;

function staleTimeOfLastCall(): (query: Query) => number {
  const options = query.mock.calls.at(-1)?.[0] as {
    staleTime: (query: Query) => number;
  };
  return options.staleTime;
}

describe("ensureAppSession (client)", () => {
  it("serves a held session for the session stale time", async () => {
    query.mockResolvedValue({ user: { id: "user-1" } });

    await ensureAppSession(queryClient);

    expect(sessionOptions).toHaveBeenCalled();
    const staleTime = staleTimeOfLastCall();
    expect(STALE_SESSION).toBe(60_000);
    expect(staleTime({ state: { data: { user: {} } } } as Query)).toBe(
      STALE_SESSION
    );
  });

  it("never keeps a signed-out answer: the next call asks again", async () => {
    query.mockResolvedValue(null);
    await ensureAppSession(queryClient);
    expect(staleTimeOfLastCall()({ state: { data: null } } as Query)).toBe(0);
    expect(staleTimeOfLastCall()({ state: { data: undefined } } as Query)).toBe(
      0
    );
  });

  it("serves a preload from the cache, whatever its age, without a request", async () => {
    query.mockClear();
    getQueryData.mockReturnValue({ user: { id: "user-1" } });

    await expect(
      ensureAppSession(queryClient, { isPreload: true })
    ).resolves.toEqual({ user: { id: "user-1" } });
    expect(query).not.toHaveBeenCalled();
  });

  it("lets a preload fetch when nothing is cached yet", async () => {
    query.mockClear();
    getQueryData.mockReturnValue(undefined);
    query.mockResolvedValue({ user: { id: "user-2" } });

    await ensureAppSession(queryClient, { isPreload: true });
    expect(query).toHaveBeenCalledOnce();
  });
});
