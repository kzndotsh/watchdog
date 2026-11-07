import type { QueryClient } from "@tanstack/react-query";

import { graphSnapshotQuery } from "@/domains/entities/edges/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/** Warm the Graph page's snapshot without blocking navigation. */
export function warmGraphQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...graphSnapshotQuery(caseId),
    shouldRevalidateIfStale: true,
  });
}
