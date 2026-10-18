import { useCallback } from "react";

import { useRestoreCase } from "@/domains/cases/hooks/use-restore-case";
import type { CaseRecord } from "@/domains/cases/types";
import { toast } from "@/shared/ui/toast";

/** How long the Restore toast stays up after a delete. */
const UNDO_TOAST_MS = 8000;

/**
 * After a delete: a toast that names the Case and offers Restore (the same restore procedure as
 * the Deleted Cases view) for a few seconds. Returns the function to call from `onDeleted`.
 */
export function useCaseDeletedToast(): (
  deleted: Pick<CaseRecord, "id" | "name">
) => void {
  const { mutate: restore } = useRestoreCase();
  return useCallback(
    (deleted) => {
      toast.add({
        title: `\u201C${deleted.name}\u201D deleted`,
        type: "success",
        timeout: UNDO_TOAST_MS,
        actionProps: {
          children: "Restore",
          onClick: () => {
            restore(deleted);
          },
        },
      });
    },
    [restore]
  );
}
