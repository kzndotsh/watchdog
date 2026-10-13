import type { QueryClient } from "@tanstack/react-query";

import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/** Warm entity table data without blocking shell paint. */
export function warmEntitiesQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...entitiesListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...edgesForCaseQuery(caseId),
    shouldRevalidateIfStale: true,
  });
}
