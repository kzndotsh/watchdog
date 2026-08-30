import type { QueryClient } from "@tanstack/react-query";
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
  it("always warms recent activity", () => {
    const ensureQueryData = vi.fn().mockResolvedValue(undefined);
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const client = { ensureQueryData, prefetchQuery } as unknown as QueryClient;

    warmDashboardQueries(client, null);

    expect(ensureQueryData).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: recentActivityQuery().queryKey,
        revalidateIfStale: true,
      })
    );
    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("prefetches case-scoped dashboard panels when active case is set", () => {
    const ensureQueryData = vi.fn().mockResolvedValue(undefined);
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const client = { ensureQueryData, prefetchQuery } as unknown as QueryClient;

    warmDashboardQueries(client, "case-1");

    const prefetchedKeys = prefetchQuery.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(prefetchedKeys).toContainEqual(entitiesListQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(
      proposalsByStatusQuery("case-1", "pending").queryKey
    );
    expect(prefetchedKeys).toContainEqual(jobsListQuery("case-1").queryKey);
    expect(prefetchedKeys).toContainEqual(tasksListQuery("case-1").queryKey);
    expect(prefetchQuery).toHaveBeenCalledTimes(4);
  });
});
