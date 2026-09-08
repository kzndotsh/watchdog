import type { QueryClient } from "@tanstack/react-query";

import { entitiesListQuery } from "@/domains/entities/queries";
import { tasksListQuery, type TaskListFilters } from "@/domains/tasks/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/** Warm task board data without blocking shell paint. */
export function warmTasksQueries(
  queryClient: QueryClient,
  caseId: string,
  filters?: TaskListFilters
): void {
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(caseId, filters),
    revalidateIfStale: true,
  });
  if (filters?.entityId !== undefined) {
    warmEnsureQueryData(queryClient, {
      ...tasksListQuery(caseId),
      revalidateIfStale: true,
    });
  }
  warmEnsureQueryData(queryClient, {
    ...entitiesListQuery(caseId),
    revalidateIfStale: true,
  });
}
