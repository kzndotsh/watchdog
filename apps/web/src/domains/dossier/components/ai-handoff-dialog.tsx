import {
  formatHandoffSize,
  type PendingAiHandoff,
} from "@/domains/entities/lib/entity-export";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";
import { Button } from "@/shared/ui/primitives/button";
import { AI_HANDOFF_DESTINATION_LABELS } from "@watchdog/schemas/shared";

type AiHandoffDialogProps = {
  /** The handoff waiting for confirmation; `null` keeps the dialog closed. */
  pending: PendingAiHandoff | null;
  isConfirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The last stop before a Dossier leaves Watchdog: names the destination, the Entity and
 * the size of the text, and nothing is opened or recorded until the user confirms.
 */
export function AiHandoffDialog({
  pending,
  isConfirming,
  onConfirm,
  onCancel,
}: AiHandoffDialogProps) {
  const destination =
    pending === null ? "" : AI_HANDOFF_DESTINATION_LABELS[pending.destination];
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !isConfirming) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Send {pending?.entityName} to {destination}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending === null
              ? null
              : `The Markdown of this Dossier (${formatHandoffSize(pending)}) goes into a link that opens ${destination} in a new tab. Once it leaves Watchdog, ${destination} and your browser hold a copy outside your control. The handoff is recorded in Recent activity with who sent it, the Entity and ${destination}, never the text.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>Cancel</AlertDialogCancel>
          <Button loading={isConfirming} onClick={onConfirm}>
            Send to {destination}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
