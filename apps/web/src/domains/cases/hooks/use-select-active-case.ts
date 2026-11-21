import { useMutation } from "@tanstack/react-query";

import { rememberLastCase } from "@/domains/cases/lib/active-case";
import {
  type CaseSwitchNavigate,
  navigateAfterActiveCaseSwitch,
} from "@/domains/cases/lib/active-case-switch";
import type { CaseRecord } from "@/domains/cases/types";
import { couldnt, errMessage } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";
import { parseOptionalTrimmedUuid } from "@watchdog/domain/schemas/shared";

/** The one failure copy for switching the Active Case (house style: errMessage adds "Try again." on a 500). */
export const ACTIVE_CASE_SWITCH_ERROR = `${couldnt("switch", "Case")}.`;

/**
 * The one way to switch the Active Case. No server write: on a Case URL the switch navigates to
 * the same screen of the new Case (the URL names the Active Case); elsewhere it becomes the last
 * Case entered, which Case-less screens follow. The sidebar switcher, command palette, Case list
 * and Case overview all call it.
 *
 * @canonical `useSelectActiveCase`: Active-Case switch
 */
export function useSelectActiveCase(input: {
  /** Cases the target id is resolved against. */
  cases: CaseRecord[];
  pathname?: string;
  navigate?: CaseSwitchNavigate;
  /** When set, always navigates to the selected case Overview after switch. */
  shouldNavigateToOverview?: boolean;
}) {
  return useMutation({
    mutationFn: async (caseId: string) => {
      const scopedCaseId = parseOptionalTrimmedUuid(caseId);
      const next =
        scopedCaseId === undefined
          ? undefined
          : input.cases.find((c) => c.id === scopedCaseId);
      if (next === undefined) throw new Error("Case not found");
      rememberLastCase(next.id);
      if (input.shouldNavigateToOverview && input.navigate) {
        await input.navigate({
          to: "/cases/$caseSlug",
          params: { caseSlug: next.slug },
        });
      } else if (input.navigate && input.pathname !== undefined) {
        await navigateAfterActiveCaseSwitch({
          next,
          pathname: input.pathname,
          navigate: input.navigate,
        });
      }
      return caseId;
    },
    onError: (err) => {
      toast.error(errMessage(err, ACTIVE_CASE_SWITCH_ERROR));
    },
  });
}
