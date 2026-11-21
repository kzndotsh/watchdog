import type { QueryClient } from "@tanstack/react-query";

import {
  deletedCaseListView,
  deletionPolicyQuery,
} from "@/domains/cases/queries";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { deletedCaseList } from "@watchdog/domain/schemas/cases";
import type { ListSearch } from "@watchdog/domain/schemas/shared";

/**
 * Warm the Deleted Cases first page (the URL's view) in the browser, without blocking paint, and
 * only for an owner or admin: the server refuses the list to anyone else, so the policy decides
 * first (it is cached for the whole session, `STALE_STABLE`). A failed policy read is left to
 * the screen, which reads it again and shows the failure.
 */
export async function warmDeletedCases(
  queryClient: QueryClient,
  search: ListSearch<typeof deletedCaseList>
): Promise<void> {
  try {
    const policy = await ensureAppQueryData(queryClient, deletionPolicyQuery());
    if (policy.canManage) {
      deletedCaseListView.warm(
        queryClient,
        {},
        deletedCaseList.queryOf(search)
      );
    }
  } catch (error) {
    // Nothing to warm: the screen reads the policy again and shows its failure.
    void error;
  }
}
