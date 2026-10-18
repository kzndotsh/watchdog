import { useMutation, useQueryClient } from "@tanstack/react-query";

import { restoreCaseFn } from "@/domains/cases/cases.functions";
import { forgetMissingCase } from "@/domains/cases/hooks/case-cache";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { couldnt, errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { deleteCaseInputSchema } from "@watchdog/schemas/cases";

/**
 * Restore a deleted Case (owner or admin, inside the restore window). The Case is visible again
 * everywhere once its caches settle. The result and the failure are toasts, set on the hook so
 * they still fire when the caller (the delete toast's Restore, a screen that navigated away)
 * has unmounted.
 */
export function useRestoreCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (target: Pick<CaseRecord, "id">) =>
      restoreCaseFn({
        data: deleteCaseInputSchema.parse({ caseId: target.id }),
      }),
    onSuccess: async (restored) => {
      forgetMissingCase(queryClient, restored);
      await invalidateAfterCaseSwitch(queryClient);
      notifyCasesChanged();
      toast.success(`\u201C${restored.name}\u201D restored`);
    },
    onError: (caughtError) => {
      toast.error(errMessage(caughtError, couldnt("restore", "Case")));
    },
  });
}
