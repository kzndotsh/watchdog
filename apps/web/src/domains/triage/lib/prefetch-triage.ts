import type { QueryClient } from "@tanstack/react-query";

import { evidenceListQuery } from "@/domains/intake/queries";
import { allProposalsQuery } from "@/domains/triage/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/** Warm Triage queue + detail evidence without blocking shell paint. */
export function warmTriageQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...allProposalsQuery(caseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId, { hiddenOnly: true }),
    revalidateIfStale: true,
  });
}
