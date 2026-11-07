import type { QueryClient } from "@tanstack/react-query";

import { graphSnapshotQuery } from "@/domains/entities/edges/queries";
import {
  warmEnsureQueryData,
  ensureAppQueryData,
} from "@/shared/lib/warm-query";

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

/** Block until the snapshot is in cache — tests and explicit preload only. */
export async function ensureGraphQueries(
  queryClient: QueryClient,
  caseId: string
): Promise<void> {
  await ensureAppQueryData(queryClient, graphSnapshotQuery(caseId));
}
