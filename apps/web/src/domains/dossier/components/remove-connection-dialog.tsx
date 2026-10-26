import { useState } from "react";

import { useDeleteConnection } from "@/domains/dossier/hooks/use-delete-connection";
import type { DossierEntityScope } from "@/domains/dossier/types";
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
import { FieldError } from "@watchdog/ui/components/field";

type RemoveConnectionDialogProps = {
  scope: DossierEntityScope;
  /** The Connection to remove; null keeps the dialog closed. */
  edgeId: string | null;
  onClose: () => void;
};

/** "Remove connection": confirms, deletes, and keeps the dialog open with the error on a failure. */
export function RemoveConnectionDialog({
  scope,
  edgeId,
  onClose,
}: RemoveConnectionDialogProps) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteMutation = useDeleteConnection({
    onDeleted: () => {
      setDeleteError(null);
      onClose();
    },
    onError: setDeleteError,
  });

  return (
    <AlertDialog
      open={edgeId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setDeleteError(null);
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove connection</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the edge from the Case graph. You can add it again
            later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldError>{deleteError}</FieldError>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (edgeId !== null) {
                deleteMutation.mutate({ ...scope, edgeId });
              }
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
