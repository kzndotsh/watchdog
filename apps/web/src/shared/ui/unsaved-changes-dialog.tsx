import type { UnsavedGuard } from "@/shared/hooks/use-unsaved-guard";
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

type UnsavedChangesDialogProps = {
  guard: UnsavedGuard;
  /** What is lost, e.g. "your notes". */
  subject?: string;
};

/** Confirmation for `useUnsavedGuard`: Keep Editing keeps the draft, Discard Changes leaves. */
export function UnsavedChangesDialog({
  guard,
  subject = "your changes",
}: UnsavedChangesDialogProps) {
  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) guard.stay();
  }

  function handleDiscard() {
    guard.discard();
  }

  return (
    <AlertDialog open={guard.isBlocked} onOpenChange={handleOpenChange}>
      <AlertDialogContent enterConfirms={false}>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Leaving this page discards {subject}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDiscard}>
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
