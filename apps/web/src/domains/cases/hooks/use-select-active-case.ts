import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setActiveCaseIdFn } from "@/domains/cases/cases.functions";
import {
  setActiveCaseIdInputSchema,
  type CaseRecord,
} from "@/domains/cases/types";
import { errMessage } from "@/lib/utils";
import {
  finalizeActiveCaseSwitch,
  navigateAfterActiveCaseSwitch,
  optimisticActiveCaseSwitch,
  rollbackActiveCaseSwitch,
} from "@/shared/lib/active-case-switch";
import { toast } from "@/shared/ui/toast";
import { parseOptionalTrimmedUuid } from "@watchdog/schemas";

type NavigateFn = (opts: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, never>;
  replace?: boolean;
}) => Promise<void> | void;

/** The one failure copy for switching the Active Case (house style: errMessage adds "Try again." on a 500). */
export const ACTIVE_CASE_SWITCH_ERROR = "Couldn't switch Case.";

/**
 * The one way to switch the Active Case: server write, optimistic cache update,
 * rollback + one error toast on failure, Case invalidation on success. The sidebar
 * switcher, command palette, Case list and Case overview all call it.
 */
export function useSelectActiveCase(input: {
  /** Cases the target id is resolved against (the optimistic update needs the row). */
  cases: CaseRecord[];
  pathname?: string;
  entityId?: string;
  navigate?: NavigateFn;
  /** When set, always navigates to the selected case Overview after switch. */
  navigateToOverview?: boolean;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (caseId: string) => {
      await setActiveCaseIdFn({
        data: setActiveCaseIdInputSchema.parse({ caseId }),
      });
      return caseId;
    },
    onMutate: async (caseId) =>
      optimisticActiveCaseSwitch(queryClient, input.cases, caseId),
    onError: (err, _caseId, ctx) => {
      rollbackActiveCaseSwitch(queryClient, ctx?.prev);
      toast.error(errMessage(err, ACTIVE_CASE_SWITCH_ERROR));
    },
    onSuccess: async (caseId, _vars, ctx) => {
      const scopedCaseId = parseOptionalTrimmedUuid(caseId);
      const next =
        ctx?.next ??
        (scopedCaseId === undefined
          ? undefined
          : input.cases.find((c) => c.id === scopedCaseId));
      if (next && input.navigateToOverview && input.navigate) {
        await input.navigate({
          to: "/cases/$caseSlug",
          params: { caseSlug: next.slug },
        });
      } else if (next && input.navigate && input.pathname !== undefined) {
        await navigateAfterActiveCaseSwitch({
          next,
          pathname: input.pathname,
          entityId: input.entityId,
          navigate: input.navigate,
        });
      }
      await finalizeActiveCaseSwitch(queryClient, next);
    },
  });
}
