import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BriefcaseIcon } from "lucide-react";
import { useState } from "react";

import { deleteCaseFn } from "@/domains/cases/cases.functions";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";

export function DeleteCaseDialog({
  caseRow,
  open,
  onOpenChange,
  onDeleted,
}: {
  caseRow: CaseRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: CaseRecord) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteCaseFn({ data: { id } }),
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

  return (
    <DestructiveConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title="Delete case"
      description={
        caseRow
          ? `Delete “${caseRow.name}” and everything in it — entities, evidence, collect, triage, and tasks.`
          : undefined
      }
      confirmLabel="Delete case"
      verificationPhrase={caseRow?.name ?? ""}
      verificationLabel="Type the case name"
      irreversibility="Deleting this case cannot be undone."
      media={<BriefcaseIcon />}
      loading={deleteMutation.isPending}
      error={error}
      onConfirm={() => {
        if (caseRow) deleteMutation.mutate(caseRow.id);
      }}
    />
  );
}
