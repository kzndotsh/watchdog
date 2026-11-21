import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { invalidateAfterCaseSwitch } from "@/app/lib/query-invalidation";
import { casesKeys } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";

/**
 * What the first-Case onboarding step does with the Case it just created: teach the visible
 * Cases the route guard reads (it holds the empty list the user was sent here for, and would
 * send them straight back), refresh the dependents and open the Case's overview, which makes it
 * the Active Case.
 */
export function useOpenFirstCase(): (created: CaseRecord) => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (created) => {
    queryClient.setQueryData<CaseRecord[]>(casesKeys.visible(), [created]);
    void invalidateAfterCaseSwitch(queryClient);
    await navigate({
      to: "/cases/$caseSlug",
      params: { caseSlug: created.slug },
    });
  };
}
