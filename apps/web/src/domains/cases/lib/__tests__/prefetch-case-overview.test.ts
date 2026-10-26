import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { warmCaseOverviewQueries } from "@/domains/cases/lib/prefetch-case-overview";
import { caseCountsQuery } from "@/domains/cases/queries";
import { recentEvidenceQuery } from "@/domains/intake/queries";
import { jobsRecentQuery } from "@/domains/jobs/queries";
import { pendingProposalsQuery } from "@/domains/triage/queries";

// Warm helpers fetch in the browser only; this node project stands in for it.
beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("warmCaseOverviewQueries", () => {
  it("warms the counts and one page of each recent list, no whole list", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmCaseOverviewQueries(client, "case-1");
    await Promise.resolve();

    const warmedKeys = query.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(warmedKeys).toContainEqual(caseCountsQuery("case-1").queryKey);
    expect(warmedKeys).toContainEqual(recentEvidenceQuery("case-1").queryKey);
    expect(warmedKeys).toContainEqual(jobsRecentQuery("case-1").queryKey);
    expect(warmedKeys).toContainEqual(pendingProposalsQuery("case-1").queryKey);
    expect(query).toHaveBeenCalledTimes(4);
  });
});
