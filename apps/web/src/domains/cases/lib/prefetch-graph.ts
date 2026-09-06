import type { QueryClient } from "@tanstack/react-query";

import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { warmPrefetchQuery, ensureAppQueryData } from "@/shared/lib/warm-query";

/** Warm graph canvas queries without blocking navigation. */
export function warmGraphQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmPrefetchQuery(queryClient, entitiesListQuery(caseId));
  warmPrefetchQuery(queryClient, edgesForCaseQuery(caseId));
}

/** Block until graph data is in cache — tests and explicit preload only. */
export async function ensureGraphQueries(
  queryClient: QueryClient,
  caseId: string
): Promise<void> {
  await ensureAppQueryData(queryClient, entitiesListQuery(caseId));
  await ensureAppQueryData(queryClient, edgesForCaseQuery(caseId));
}
