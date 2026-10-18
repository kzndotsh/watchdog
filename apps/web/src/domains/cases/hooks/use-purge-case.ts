import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { purgeCaseFn } from "@/domains/cases/cases.functions";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import type { DeletedCaseRecord } from "@/domains/cases/types";
import { couldnt, errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { deleteCaseInputSchema } from "@watchdog/schemas/cases";

/**
 * Purge a deleted Case now (owner or admin, session only): its content and files are erased and
 * only the deletion record stays. A failure stays inside the confirmation (the server records
 * it on the Case and the scheduled purge retries).
 */
export function usePurgeCase({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const purgeMutation = useMutation({
    mutationFn: async (target: Pick<DeletedCaseRecord, "id">) =>
      purgeCaseFn({
        data: deleteCaseInputSchema.parse({ caseId: target.id }),
      }),
    onSuccess: async () => {
      setError(null);
      onOpenChange(false);
      await invalidateAfterCaseSwitch(queryClient);
      notifyCasesChanged();
      toast.success("Case purged");
    },
    onError: (caughtError) => {
      setError(errMessage(caughtError, couldnt("purge", "Case")));
    },
  });

  return { purgeMutation, error, setError };
}
