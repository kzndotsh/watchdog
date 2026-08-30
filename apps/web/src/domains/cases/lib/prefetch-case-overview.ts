import type { QueryClient } from "@tanstack/react-query";

import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { jobsListQuery } from "@/domains/jobs/queries";
import { proposalsByStatusQuery } from "@/domains/triage/queries";
import { warmPrefetchQuery } from "@/shared/lib/warm-query";

/** Warm Case Overview dashboard lists without blocking navigation. */
export function warmCaseOverviewQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmPrefetchQuery(queryClient, entitiesListQuery(caseId));
  warmPrefetchQuery(queryClient, identifiersForCaseQuery(caseId));
  warmPrefetchQuery(queryClient, edgesForCaseQuery(caseId));
  warmPrefetchQuery(queryClient, evidenceListQuery(caseId));
  warmPrefetchQuery(queryClient, jobsListQuery(caseId));
  warmPrefetchQuery(queryClient, proposalsByStatusQuery(caseId, "pending"));
}
