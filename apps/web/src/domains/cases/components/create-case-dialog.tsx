import { CreateCaseForm } from "@/domains/cases/components/create-case-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";

type CreateCaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  onError: (message: string) => void;
};

/** New Case dialog around the one create-Case form (the popup unmounts on close, which resets it). */
export function CreateCaseDialog({
  open,
  onOpenChange,
  onCreated,
  onError,
}: CreateCaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Case</DialogTitle>
          <DialogDescription>
            Cases are an isolated workspace for managing your investigation.
          </DialogDescription>
        </DialogHeader>
        <CreateCaseForm
          onCreated={() => {
            onOpenChange(false);
            onCreated();
          }}
          onError={onError}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
