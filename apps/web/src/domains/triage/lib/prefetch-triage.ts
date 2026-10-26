import type { QueryClient } from "@tanstack/react-query";

import { evidenceListQuery } from "@/domains/intake/queries";
import type { TriageSearch } from "@/domains/triage/lib/triage-search";
import { proposalListView } from "@/domains/triage/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { proposalList } from "@watchdog/schemas/jobs";

/** Warm the URL's first queue page and the Detail's Evidence without blocking shell paint. */
export function warmTriageQueries(
  queryClient: QueryClient,
  caseId: string,
  search: TriageSearch
): void {
  proposalListView.warm(queryClient, { caseId }, proposalList.queryOf(search));
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId, { isHiddenOnly: true }),
    shouldRevalidateIfStale: true,
  });
}
