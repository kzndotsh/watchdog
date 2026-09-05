import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { deleteIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";

export interface DeleteIdentifierTarget {
  id: string;
  type: string;
  value: string;
}

export function DeleteIdentifierDialog({
  caseId,
  target,
  open,
  onOpenChange,
  onDeleted,
}: {
  caseId: string;
  target: DeleteIdentifierTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: DeleteIdentifierTarget) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (identifierId: string) =>
      deleteIdentifierFn({ data: { caseId, identifierId } }),
    onSuccess: async () => {
      if (!target) return;
      setError(null);
      onOpenChange(false);
      await invalidateAfterEntityChanged(queryClient, caseId);
      toast.success("Identifier deleted");
      onDeleted?.(target);
    },
    onError: (caughtError) => {
      setError(errMessage(caughtError, "Delete failed"));
    },
  });

  const displayValue =
    target && target.value.length > 48
      ? `${target.value.slice(0, 45)}…`
      : (target?.value ?? "");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete identifier</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `Remove ${target.type} “${displayValue}” from this Case. Evidence stays attached to the Case.`
              : "Remove this identifier from the Case."}
          </AlertDialogDescription>
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
              if (target) deleteMutation.mutate(target.id);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
