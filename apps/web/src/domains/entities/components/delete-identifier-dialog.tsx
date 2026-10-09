import { useDeleteIdentifier } from "@/domains/entities/hooks/use-delete-identifier";
import type { DeleteIdentifierTarget } from "@/domains/entities/hooks/use-delete-identifier";
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
import { kindLabel } from "@/shared/ui/vocab/kind.lib";

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
  const { deleteMutation, error, setError } = useDeleteIdentifier({
    caseId,
    target,
    onOpenChange,
    onDeleted,
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
              ? `Remove ${kindLabel(target.type)} “${displayValue}” from this Case. Evidence stays attached to the Case.`
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
