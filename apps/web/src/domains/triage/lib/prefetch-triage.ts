import type { QueryClient } from "@tanstack/react-query";

import { evidenceListQuery } from "@/domains/intake/queries";
import { allProposalsQuery } from "@/domains/triage/queries";
import {
  warmEnsureInfiniteQueryData,
  warmEnsureQueryData,
} from "@/shared/lib/warm-query";

/** Warm Triage queue + detail evidence without blocking shell paint. */
export function warmTriageQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureInfiniteQueryData(queryClient, {
    ...allProposalsQuery(caseId),
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
}
