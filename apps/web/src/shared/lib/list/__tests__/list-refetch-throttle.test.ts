import { QueryClient, type Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIST_REFETCH_THROTTLE_MS,
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
});
