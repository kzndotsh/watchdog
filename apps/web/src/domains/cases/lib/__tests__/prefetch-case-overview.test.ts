import { QueryClient } from "@tanstack/react-query";
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
  it("warms the overview dashboard queries for a case", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmCaseOverviewQueries(client, "case-1");
    await Promise.resolve();

    const warmedKeys = query.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(warmedKeys).toContainEqual(entitiesListQuery("case-1").queryKey);
    expect(warmedKeys).toContainEqual(
      identifiersForCaseQuery("case-1").queryKey
    );
    expect(warmedKeys).toContainEqual(edgesForCaseQuery("case-1").queryKey);
    expect(warmedKeys).toContainEqual(evidenceListQuery("case-1").queryKey);
    expect(warmedKeys).toContainEqual(
      evidenceListQuery("case-1", { hiddenOnly: true }).queryKey
    );
    expect(warmedKeys).toContainEqual(jobsListQuery("case-1").queryKey);
    expect(warmedKeys).toContainEqual(
      proposalsByStatusQuery("case-1", "pending").queryKey
    );
    expect(query).toHaveBeenCalledTimes(7);
  });
});
