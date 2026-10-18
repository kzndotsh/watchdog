import { useQuery } from "@tanstack/react-query";

import { useDeleteCase } from "@/domains/cases/hooks/use-delete-case";
import { daysLabel } from "@/domains/cases/lib/deleted-case-copy";
import { deletionPolicyQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";

type DeleteCaseDialogProps = {
  caseRow: CaseRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: CaseRecord) => void;
};

function restoreWindowCopy(days: number | undefined): string {
  if (days === undefined) return "for a limited time";
  return `for ${daysLabel(days)}`;
}

function cancelledJobsCopy(count: number): string {
  return count === 1
    ? "1 queued or running Job will be cancelled, and a restore does not resume it."
    : `${count} queued or running Jobs will be cancelled, and a restore does not resume them.`;
}

/**
 * Delete is a tombstone, so this is a plain confirmation (the type-the-name gate belongs to Purge
 * now): the Case moves to Deleted Cases and an owner or admin can restore it for the configured
 * window. It names the Jobs that stop.
 */
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
  // One query for the window and the Jobs this delete cancels (the server counts them).
  const { data: policy } = useQuery({
    ...deletionPolicyQuery(caseRow?.id),
    enabled: open && caseRow !== null,
  });
  const cancelledJobs = policy?.cancellableJobs ?? 0;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (deleteMutation.isPending) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete case</AlertDialogTitle>
          <AlertDialogDescription>
            {caseRow
              ? `\u201C${caseRow.name}\u201D moves to Deleted Cases and disappears from every list. An owner or admin can restore it ${restoreWindowCopy(policy?.restoreWindowDays)}; after that it is purged, and its entities, evidence and files are erased for good.`
              : undefined}
          </AlertDialogDescription>
          {cancelledJobs > 0 ? (
            <AlertDialogDescription>
              {cancelledJobsCopy(cancelledJobs)}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (caseRow) deleteMutation.mutate(caseRow);
            }}
          >
            Delete case
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
