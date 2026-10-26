import type { QueryClient } from "@tanstack/react-query";

import { caseCountsQuery } from "@/domains/cases/queries";
import { recentEvidenceQuery } from "@/domains/intake/queries";
import { jobsRecentQuery } from "@/domains/jobs/queries";
import { pendingProposalsQuery } from "@/domains/triage/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/**
 * Warm what the Case overview reads without blocking navigation: the tile counts and one page
 * each of the newest Evidence, Jobs and pending Proposals (#571).
 */
export function warmCaseOverviewQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...caseCountsQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...recentEvidenceQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...jobsRecentQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...pendingProposalsQuery(caseId),
    shouldRevalidateIfStale: true,
  });
}
