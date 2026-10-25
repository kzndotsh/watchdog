import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { casesKeys } from "@/domains/cases/queries";
import type { CaseRecord, CasesContext } from "@/domains/cases/types";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";

/**
 * What the first-Case onboarding step does with the Case it just created: `createCaseFn`
 * already made it the Active Case (cookie), so this teaches the cases context the route
 * guard reads (it holds the empty list the user was sent here for, and would send them
 * straight back), refreshes the dependents and opens the Case's overview.
 */
export function useOpenFirstCase(): (created: CaseRecord) => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (created) => {
    queryClient.setQueryData<CasesContext>(casesKeys.context(), {
      cases: [created],
      active: created,
    });
    void invalidateAfterCaseSwitch(queryClient);
    await navigate({
      to: "/cases/$caseSlug",
      params: { caseSlug: created.slug },
    });
  };
}
