import type { QueryClient } from "@tanstack/react-query";

import type { TriageSearch } from "@/domains/triage/lib/triage-search";
import { proposalByIdQuery, proposalListView } from "@/domains/triage/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { proposalList } from "@watchdog/schemas/jobs";

/**
 * Warm the URL's first queue page, and the selected Proposal when the URL names one (its Detail
 * reads it by id), without blocking shell paint.
 */
export function warmTriageQueries(
  queryClient: QueryClient,
  caseId: string,
  search: TriageSearch
): void {
  proposalListView.warm(queryClient, { caseId }, proposalList.queryOf(search));
  const selected = proposalByIdQuery(caseId, search.proposalId ?? null);
  if (selected.enabled) warmEnsureQueryData(queryClient, selected);
}
