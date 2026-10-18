import { Trash2Icon } from "lucide-react";

import { usePurgeCase } from "@/domains/cases/hooks/use-purge-case";
import type { DeletedCaseRecord } from "@/domains/cases/types";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";

type PurgeCaseDialogProps = {
  target: DeletedCaseRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Purge now is permanent, so it keeps the type-the-name gate and says what goes and what stays:
 * the content and the files are erased for good; only the deletion record remains.
 */
export function PurgeCaseDialog({
  target,
  open,
  onOpenChange,
}: PurgeCaseDialogProps) {
  const { purgeMutation, error, setError } = usePurgeCase({ onOpenChange });

  return (
    <DestructiveConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title="Purge case"
      description={
        target
          ? `Erase \u201C${target.name}\u201D now, without waiting for its restore window to end. Its entities, claims, evidence, jobs, history and stored files are erased for good and cannot be restored. Only a short deletion record stays: the Case\u2019s name, who deleted it, when, and what was erased.`
          : undefined
      }
      confirmLabel="Purge case"
      verificationPhrase={target?.name ?? ""}
      verificationLabel="Type the case name"
      irreversibility="Purging this case cannot be undone."
      media={<Trash2Icon />}
      isLoading={purgeMutation.isPending}
      error={error}
      onConfirm={() => {
        if (target) purgeMutation.mutate(target);
      }}
    />
  );
}
