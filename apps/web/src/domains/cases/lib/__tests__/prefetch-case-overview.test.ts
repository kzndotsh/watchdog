import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { warmCaseOverviewQueries } from "@/domains/cases/lib/prefetch-case-overview";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { jobsListQuery } from "@/domains/jobs/queries";
import { proposalsByStatusQuery } from "@/domains/triage/queries";

describe("warmCaseOverviewQueries", () => {
  it("prefetches the overview dashboard queries for a case", () => {
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const client = { prefetchQuery } as unknown as QueryClient;

    warmCaseOverviewQueries(client, "case-1");

    const prefetchedKeys = prefetchQuery.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(prefetchedKeys).toContainEqual(entitiesListQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(
      identifiersForCaseQuery("case-1").queryKey
    );
    expect(prefetchedKeys).toContainEqual(edgesForCaseQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(evidenceListQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(jobsListQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(
      proposalsByStatusQuery("case-1", "pending").queryKey
    );
    expect(prefetchQuery).toHaveBeenCalledTimes(6);
  });
});
