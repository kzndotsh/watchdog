import { QueryClient, type Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIST_REFETCH_THROTTLE_MS,
  listRefetchSlotCount,
  throttledListRefetch,
} from "@/shared/lib/list/list-refetch-throttle";

function viewQuery(client: QueryClient): Query {
  const queryKey: readonly unknown[] = [
    "evidence",
    "case",
    "list",
    "evidence",
    "[]",
  ];
  return client
    .getQueryCache()
    .build(client, { queryKey, meta: { isListView: true } });
}

describe("throttledListRefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refetches at once, then once more at the end of the window for a burst", async () => {
    const client = new QueryClient();
    const query = viewQuery(client);
    const refetch = vi.fn(async () => undefined);

    await throttledListRefetch(client, query, refetch);
    expect(refetch).toHaveBeenCalledTimes(1);

    // A burst of five inside the window shares one trailing refetch.
    const burst = Array.from({ length: 5 }, async () =>
      throttledListRefetch(client, query, refetch)
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LIST_REFETCH_THROTTLE_MS);
    await Promise.all(burst);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("keeps a separate window per view", async () => {
    const client = new QueryClient();
    const one = viewQuery(client);
    const otherKey: readonly unknown[] = [
      "evidence",
      "case",
      "list",
      "evidence",
      "[1]",
    ];
    const other = client.getQueryCache().build(client, { queryKey: otherKey });
    const refetch = vi.fn(async () => undefined);

    await throttledListRefetch(client, one, refetch);
    await throttledListRefetch(client, other, refetch);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("never overlaps a slow walk: calls during it share one trailing walk after it settles", async () => {
    const client = new QueryClient();
    const query = viewQuery(client);
    let running = 0;
    let peak = 0;
    const finishes: (() => void)[] = [];
    const refetch = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      // oxlint-disable-next-line promise/avoid-new -- a walk the test finishes by hand (5 s of fake time)
      await new Promise<void>((resolve) => {
        finishes.push(resolve);
      });
      running -= 1;
    });

    const first = throttledListRefetch(client, query, refetch);
    await vi.advanceTimersByTimeAsync(1000);
    const during = [1, 2, 3].map(async () =>
      throttledListRefetch(client, query, refetch)
    );
    // Well past the window, the first walk is still running: nothing new starts.
    await vi.advanceTimersByTimeAsync(4000);
    expect(refetch).toHaveBeenCalledTimes(1);

    finishes[0]?.();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    // It settled: exactly one trailing walk starts for the three calls.
    expect(refetch).toHaveBeenCalledTimes(2);
    finishes[1]?.();
    await Promise.all(during);
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(peak).toBe(1);
  });

  it("drops a view's state once it has been idle for a window", async () => {
    const client = new QueryClient();
    const query = viewQuery(client);
    const refetch = vi.fn(async () => undefined);

    const burst = [1, 2].map(async () =>
      throttledListRefetch(client, query, refetch)
    );
    expect(listRefetchSlotCount(client)).toBe(1);
    await vi.advanceTimersByTimeAsync(LIST_REFETCH_THROTTLE_MS);
    await Promise.all(burst);
    await vi.advanceTimersByTimeAsync(LIST_REFETCH_THROTTLE_MS);
    expect(listRefetchSlotCount(client)).toBe(0);
  });
});
