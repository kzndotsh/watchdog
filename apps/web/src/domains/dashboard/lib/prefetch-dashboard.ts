import type { QueryClient } from "@tanstack/react-query";

import { recentActivityQuery } from "@/domains/activity/queries";
import { caseCountsQuery } from "@/domains/cases/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { pendingProposalsQuery } from "@/domains/triage/queries";
import {
  warmEnsureInfiniteQueryData,
  warmEnsureQueryData,
} from "@/shared/lib/warm-query";

/** Warm Dashboard panels / activity without blocking shell paint. */
export function warmDashboardQueries(
  queryClient: QueryClient,
  activeCaseId: string | null
): void {
  warmEnsureInfiniteQueryData(queryClient, {
    ...recentActivityQuery(),
    shouldRevalidateIfStale: true,
  });
  if (activeCaseId === null) return;

  warmEnsureQueryData(queryClient, {
    ...caseCountsQuery(activeCaseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...pendingProposalsQuery(activeCaseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(activeCaseId),
    shouldRevalidateIfStale: true,
  });
}
