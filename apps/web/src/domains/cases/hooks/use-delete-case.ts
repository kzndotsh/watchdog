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
  caseRow,
  onOpenChange,
  onDeleted,
}: {
  caseRow: CaseRecord | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: CaseRecord) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      deleteCaseFn({ data: deleteCaseInputSchema.parse({ caseId: id }) }),
    onSuccess: async () => {
      if (!caseRow) return;
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
