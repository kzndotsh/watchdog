import { authQueryKeys } from "@better-auth-ui/core";
import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/auth/unauthorized-error";
import { STALE_SESSION } from "@/shared/lib/query-stale";

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/ui/toast", () => ({
  toast: { error: toastErrorMock },
}));

import { createAppQueryClient } from "@/shared/lib/query-client";

describe("createAppQueryClient", () => {
  it("does not retry auth failures and retries other errors once", () => {
    const client = createAppQueryClient();
    const retry = client.getDefaultOptions().queries?.retry as (
      count: number,
      error: Error
    ) => boolean;

    expect(retry(1, new Error("Unauthorized"))).toBe(false);
    expect(retry(0, new Error("network down"))).toBe(true);
    expect(retry(1, new Error("network down"))).toBe(false);
  });

  it("toasts query errors unless marked silent", () => {
    const client = createAppQueryClient();
    const cache = client.getQueryCache();

    cache.config.onError?.(new Error("boom"), { meta: {} } as never);
    expect(toastErrorMock).toHaveBeenCalledWith("boom");

    toastErrorMock.mockClear();
    cache.config.onError?.(new Error("quiet"), {
      meta: { silentError: true },
    } as never);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("toasts house copy, not the raw message, for a server failure", () => {
    const cache = createAppQueryClient().getQueryCache();
    toastErrorMock.mockClear();
    cache.config.onError?.(new Error("Internal server error"), {
      meta: {},
    } as never);
    expect(toastErrorMock).toHaveBeenCalledWith("Couldn't load. Try again.");
  });

  it("toasts house copy when the error is not an Error or string", () => {
    const cache = createAppQueryClient().getQueryCache();
    toastErrorMock.mockClear();
    cache.config.onError?.({ code: "x" } as never, { meta: {} } as never);
    expect(toastErrorMock).toHaveBeenCalledWith("Couldn't complete request");
  });

  it("keeps the session fresh for the cookie cache window", () => {
    const client = createAppQueryClient();
    expect(client.getQueryDefaults(authQueryKeys.session).staleTime).toBe(
      STALE_SESSION
    );
  });
});

describe("a server function answering Unauthorized", () => {
  // The first test to get here pays the cold load of the contract module (see below), which
  // under a busy machine outlasts the 5 s default: give each test the waitFor's budget.
  const COLD_LOAD_MS = 30_000;

  /** A client whose session query is observed (as `useAuthenticate` does in the layout). */
  function clientWithObservedSession() {
    const client = createAppQueryClient();
    const getSession = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ user: { id: "u1" } })
      .mockResolvedValue(null);
    const observer = new QueryObserver(client, {
      queryKey: authQueryKeys.session,
      queryFn: getSession,
    });
    const seen: unknown[] = [];
    const stop = observer.subscribe((result) => {
      seen.push(result.data);
    });
    return { client, getSession, seen, stop };
  }

  it(
    "revalidates the session at once, so the authenticate hook sees the revocation",
    async () => {
      const { client, getSession, seen, stop } = clientWithObservedSession();
      await vi.waitFor(() => {
        expect(seen.at(-1)).toEqual({ user: { id: "u1" } });
      });

      client
        .getQueryCache()
        .config.onError?.(new Error("Unauthorized"), { meta: {} } as never);

      // The contract module loads on demand (every domain's query keys): allow the first load.
      await vi.waitFor(
        () => {
          expect(seen.at(-1)).toBeNull();
        },
        { timeout: 30_000 }
      );
      expect(getSession).toHaveBeenCalledTimes(2);
      stop();
    },
    COLD_LOAD_MS
  );

  it(
    "does the same for a failed mutation, and recognizes the typed error",
    async () => {
      const { client, getSession, seen, stop } = clientWithObservedSession();
      await vi.waitFor(() => {
        expect(seen.at(-1)).toEqual({ user: { id: "u1" } });
      });

      client
        .getMutationCache()
        .config.onError?.(
          new UnauthorizedError(),
          undefined as never,
          undefined as never,
          undefined as never,
          undefined as never
        );

      // The contract module loads on demand (every domain's query keys): allow the first load.
      await vi.waitFor(
        () => {
          expect(seen.at(-1)).toBeNull();
        },
        { timeout: 30_000 }
      );
      expect(getSession).toHaveBeenCalledTimes(2);
      stop();
    },
    COLD_LOAD_MS
  );

  it(
    "revalidates for any other Better Auth query that answers Unauthorized, not only a bare key match",
    async () => {
      const { client, getSession, seen, stop } = clientWithObservedSession();
      await vi.waitFor(() => {
        expect(seen.at(-1)).toEqual({ user: { id: "u1" } });
      });

      client.getQueryCache().config.onError?.(new Error("Unauthorized"), {
        meta: {},
        queryKey: [authQueryKeys.session[0], "listSessions"],
      } as never);

      await vi.waitFor(
        () => {
          expect(seen.at(-1)).toBeNull();
        },
        { timeout: 30_000 }
      );
      expect(getSession).toHaveBeenCalledTimes(2);
      stop();
    },
    COLD_LOAD_MS
  );

  it(
    "does not loop when the session query itself fails Unauthorized",
    async () => {
      const { client, getSession, seen, stop } = clientWithObservedSession();
      await vi.waitFor(() => {
        expect(seen.at(-1)).toEqual({ user: { id: "u1" } });
      });

      client.getQueryCache().config.onError?.(new Error("Unauthorized"), {
        meta: {},
        queryKey: authQueryKeys.session,
      } as never);
      await Promise.resolve();

      expect(getSession).toHaveBeenCalledTimes(1);
      stop();
    },
    COLD_LOAD_MS
  );

  it(
    "leaves the session alone for other failures",
    async () => {
      const { client, getSession, seen, stop } = clientWithObservedSession();
      await vi.waitFor(() => {
        expect(seen.at(-1)).toEqual({ user: { id: "u1" } });
      });

      client
        .getQueryCache()
        .config.onError?.(new Error("Forbidden: not your Case"), {
          meta: {},
        } as never);
      await Promise.resolve();

      expect(getSession).toHaveBeenCalledTimes(1);
      stop();
    },
    COLD_LOAD_MS
  );
});
