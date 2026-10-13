import type { QueryClient } from "@tanstack/react-query";

import { recentActivityQuery } from "@/domains/activity/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { jobsListQuery } from "@/domains/jobs/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { proposalsByStatusQuery } from "@/domains/triage/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/** Warm Dashboard panels / activity without blocking shell paint. */
export function warmDashboardQueries(
  queryClient: QueryClient,
  activeCaseId: string | null
): void {
  warmEnsureQueryData(queryClient, {
    ...recentActivityQuery(),
    shouldRevalidateIfStale: true,
  });
  if (activeCaseId === null) return;

  warmEnsureQueryData(queryClient, {
    ...entitiesListQuery(activeCaseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...proposalsByStatusQuery(activeCaseId, "pending"),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...jobsListQuery(activeCaseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(activeCaseId),
    shouldRevalidateIfStale: true,
  });
}
