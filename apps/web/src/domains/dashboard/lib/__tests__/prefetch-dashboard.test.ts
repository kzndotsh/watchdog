import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { recentActivityQuery } from "@/domains/activity/queries";
import { warmDashboardQueries } from "@/domains/dashboard/lib/prefetch-dashboard";
import { entitiesListQuery } from "@/domains/entities/queries";
import { jobsListQuery } from "@/domains/jobs/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { proposalsByStatusQuery } from "@/domains/triage/queries";

describe("warmDashboardQueries", () => {
  it("always warms recent activity", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmDashboardQueries(client, null);
    await Promise.resolve();

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: recentActivityQuery().queryKey,
      })
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("prefetches case-scoped dashboard panels when active case is set", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmDashboardQueries(client, "case-1");
    await Promise.resolve();

    const prefetchedKeys = query.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(prefetchedKeys).toContainEqual(entitiesListQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(
      proposalsByStatusQuery("case-1", "pending").queryKey
    );
    expect(prefetchedKeys).toContainEqual(jobsListQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(tasksListQuery("case-1").queryKey);
    expect(query).toHaveBeenCalledTimes(5);
  });
});
