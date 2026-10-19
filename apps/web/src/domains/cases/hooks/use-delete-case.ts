import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteCaseFn } from "@/domains/cases/cases.functions";
import { dropCaseFromCaches } from "@/domains/cases/hooks/case-cache";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { couldnt, errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { deleteCaseInputSchema } from "@watchdog/schemas/cases";

/**
 * Delete a Case (a tombstone: it moves to Deleted Cases and can be restored), then take it out
 * of every Case cache at once and settle the rest; the dialog owns open state and copy.
 */
export function useDeleteCase({
  onOpenChange,
  onDeleted,
}: {
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: CaseRecord) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    // The Case being deleted travels as the mutation variable: a hook prop would follow
    // a re-render, and a pending deletion must settle the Case it was started for.
    mutationFn: async (caseRow: CaseRecord) =>
      deleteCaseFn({
        data: deleteCaseInputSchema.parse({ caseId: caseRow.id }),
      }),
    onSuccess: async (_data, caseRow) => {
      setError(null);
      onOpenChange(false);
      dropCaseFromCaches(queryClient, caseRow);
      await invalidateAfterCaseSwitch(queryClient);
      notifyCasesChanged();
      onDeleted?.(caseRow);
    },
    onError: (caughtError) => {
      setError(errMessage(caughtError, couldnt("delete", "Case")));
    },
  });

  return { deleteMutation, error, setError };
}
