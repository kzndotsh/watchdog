import type { QueryClient } from "@tanstack/react-query";

import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { jobsListQuery } from "@/domains/jobs/queries";
import { pendingProposalsQuery } from "@/domains/triage/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/** Warm Case Overview dashboard lists without blocking navigation. */
export function warmCaseOverviewQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...entitiesListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...identifiersForCaseQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...edgesForCaseQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId, { isHiddenOnly: true }),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...jobsListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...pendingProposalsQuery(caseId),
    shouldRevalidateIfStale: true,
  });
}
