import { QueryClient } from "@tanstack/react-query";
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
    const query = vi.fn().mockResolvedValue(undefined);
    const client = { query } as unknown as QueryClient;

    await ensureGraphQueries(client, "case-1");

    expect(query).toHaveBeenCalledTimes(2);
    const ensuredKeys = query.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(ensuredKeys).toEqual([
      entitiesListQuery("case-1").queryKey,
      edgesForCaseQuery("case-1").queryKey,
    ]);
  });
});

describe("warmGraphQueries", () => {
  it("warms entities and edges without blocking", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmGraphQueries(client, "case-1");
    await Promise.resolve();

    expect(query).toHaveBeenCalledTimes(2);
    const warmedKeys = query.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(warmedKeys).toEqual([
      entitiesListQuery("case-1").queryKey,
      edgesForCaseQuery("case-1").queryKey,
    ]);
  });
});
