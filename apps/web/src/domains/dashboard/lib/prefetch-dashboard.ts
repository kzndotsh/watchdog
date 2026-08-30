import type { QueryClient } from "@tanstack/react-query";

import { recentActivityQuery } from "@/domains/activity/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { jobsListQuery } from "@/domains/jobs/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { proposalsByStatusQuery } from "@/domains/triage/queries";
import {
  warmEnsureQueryData,
  warmPrefetchQuery,
} from "@/shared/lib/warm-query";

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
  warmPrefetchQuery(queryClient, entitiesListQuery(activeCaseId));
  warmPrefetchQuery(
    queryClient,
    proposalsByStatusQuery(activeCaseId, "pending")
  );
  warmPrefetchQuery(queryClient, jobsListQuery(activeCaseId));
  warmPrefetchQuery(queryClient, tasksListQuery(activeCaseId));
}
