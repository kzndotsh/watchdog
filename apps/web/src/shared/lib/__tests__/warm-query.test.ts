import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  warmEnsureInfiniteQueryData,
  warmEnsureQueryData,
  warmPrefetchQuery,
} from "@/shared/lib/warm-query";

describe("warm-query", () => {
  // This project runs in node: a `window` marks the browser runtime.
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fetch on the server, so SSR and the first client render agree", () => {
    const client = { query: vi.fn() } as unknown as QueryClient;
    vi.stubGlobal("window", undefined);

    warmEnsureQueryData(client, { queryKey: ["test"] });
    warmEnsureQueryData(client, {
      queryKey: ["test"],
      shouldRevalidateIfStale: true,
    });
    warmPrefetchQuery(client, { queryKey: ["test"] });

    expect(client.query).not.toHaveBeenCalled();
  });

  it("swallows CancelledError from ensureAppQueryData", async () => {
    const client = {
      query: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("CancelledError"), { name: "CancelledError" })
        ),
    } as unknown as QueryClient;

    warmEnsureQueryData(client, { queryKey: ["test"] });
    await Promise.resolve();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("swallows CancelledError from warmPrefetchQuery", async () => {
    const client = {
      query: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("CancelledError"), { name: "CancelledError" })
        ),
    } as unknown as QueryClient;

    warmPrefetchQuery(client, { queryKey: ["test"] });
    await Promise.resolve();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("logs non-cancellation errors from warmEnsureQueryData", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      query: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as QueryClient;

    warmEnsureQueryData(client, { queryKey: ["test"] });
    await vi.waitUntil(() => errorSpy.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith("[warm-query]", expect.any(Error));
    errorSpy.mockRestore();
  });

  describe("warmEnsureInfiniteQueryData", () => {
    function pagedOptions(queryFn: () => Promise<{ items: number[] }>) {
      return {
        queryKey: ["paged"],
        queryFn,
        initialPageParam: undefined as string | undefined,
        getNextPageParam: () => undefined,
        staleTime: 60_000,
      };
    }

    it("does not fetch on the server", () => {
      const client = new QueryClient();
      const spy = vi.spyOn(client, "infiniteQuery");
      vi.stubGlobal("window", undefined);
      warmEnsureInfiniteQueryData(client, pagedOptions(vi.fn()));
      expect(spy).not.toHaveBeenCalled();
    });

    it("fetches the first page when nothing is cached", async () => {
      const client = new QueryClient();
      const queryFn = vi.fn().mockResolvedValue({ items: [1] });
      warmEnsureInfiniteQueryData(client, pagedOptions(queryFn));
      await vi.waitUntil(() => queryFn.mock.calls.length > 0);
      await vi.waitUntil(() => client.getQueryData(["paged"]) !== undefined);
      expect(client.getQueryData(["paged"])).toMatchObject({
        pages: [{ items: [1] }],
      });
    });

    it("leaves fresh cached pages alone when asked to revalidate only stale ones", async () => {
      const client = new QueryClient();
      client.setQueryData(["paged"], {
        pages: [{ items: [1] }],
        pageParams: [undefined],
      });
      const queryFn = vi.fn().mockResolvedValue({ items: [2] });
      warmEnsureInfiniteQueryData(client, {
        ...pagedOptions(queryFn),
        shouldRevalidateIfStale: true,
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(queryFn).not.toHaveBeenCalled();
    });

    it("refetches stale cached pages when asked to revalidate", async () => {
      const client = new QueryClient();
      client.setQueryData(["paged"], {
        pages: [{ items: [1] }],
        pageParams: [undefined],
      });
      const queryFn = vi.fn().mockResolvedValue({ items: [2] });
      warmEnsureInfiniteQueryData(client, {
        ...pagedOptions(queryFn),
        staleTime: 0,
        shouldRevalidateIfStale: true,
      });
      await vi.waitUntil(() => queryFn.mock.calls.length > 0);
      expect(queryFn).toHaveBeenCalledTimes(1);
    });
  });
});
