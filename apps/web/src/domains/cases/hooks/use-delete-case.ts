import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteCaseFn } from "@/domains/cases/cases.functions";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { deleteCaseInputSchema } from "@watchdog/schemas/cases";

/** Delete a Case, then settle the Case caches; the dialog owns open state and copy. */
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
      await invalidateAfterCaseSwitch(queryClient);
      notifyCasesChanged();
      onDeleted?.(caseRow);
    },
    onError: (caughtError) => {
      setError(errMessage(caughtError, "Delete failed"));
    },
  });

  return { deleteMutation, error, setError };
}
