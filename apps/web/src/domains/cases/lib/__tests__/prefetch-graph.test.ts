import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import {
  ensureGraphQueries,
  warmGraphQueries,
} from "@/domains/cases/lib/prefetch-graph";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { entitiesListQuery } from "@/domains/entities/queries";

describe("ensureGraphQueries", () => {
  it("loads entities and edges for the active case", async () => {
    const ensureQueryData = vi.fn().mockResolvedValue(undefined);
    const client = { ensureQueryData } as unknown as QueryClient;

    await ensureGraphQueries(client, "case-1");

    expect(ensureQueryData).toHaveBeenCalledTimes(2);
    const ensuredKeys = ensureQueryData.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(ensuredKeys).toEqual([
      entitiesListQuery("case-1").queryKey,
      edgesForCaseQuery("case-1").queryKey,
    ]);
  });
});

describe("warmGraphQueries", () => {
  it("prefetches entities and edges without blocking", () => {
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const client = { prefetchQuery } as unknown as QueryClient;

    warmGraphQueries(client, "case-1");

    expect(prefetchQuery).toHaveBeenCalledTimes(2);
    const prefetchedKeys = prefetchQuery.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(prefetchedKeys).toEqual([
      entitiesListQuery("case-1").queryKey,
      edgesForCaseQuery("case-1").queryKey,
    ]);
  });
});
