import { BriefcaseIcon } from "lucide-react";

import { useDeleteCase } from "@/domains/cases/hooks/use-delete-case";
import type { CaseRecord } from "@/domains/cases/types";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";

type DeleteCaseDialogProps = {
  caseRow: CaseRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: CaseRecord) => void;
};

export function DeleteCaseDialog({
  caseRow,
  open,
  onOpenChange,
  onDeleted,
}: DeleteCaseDialogProps) {
  const { deleteMutation, error, setError } = useDeleteCase({
    onOpenChange,
    onDeleted,
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
      isLoading={deleteMutation.isPending}
      error={error}
      onConfirm={() => {
        if (caseRow) deleteMutation.mutate(caseRow);
      }}
    />
  );
}
