import type { QueryClient } from "@tanstack/react-query";

import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import {
  warmEnsureQueryData,
  warmPrefetchQuery,
} from "@/shared/lib/warm-query";

/** Warm identifiers table data without blocking shell paint. */
export function warmIdentifiersQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...identifiersForCaseQuery(caseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...entitiesListQuery(caseId),
    revalidateIfStale: true,
  });
  warmPrefetchQuery(queryClient, evidenceListQuery(caseId));
}
