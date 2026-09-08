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
    revalidateIfStale: true,
  });
  if (activeCaseId === null) return;

  warmEnsureQueryData(queryClient, {
    ...entitiesListQuery(activeCaseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...proposalsByStatusQuery(activeCaseId, "pending"),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...jobsListQuery(activeCaseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(activeCaseId),
    revalidateIfStale: true,
  });
}
