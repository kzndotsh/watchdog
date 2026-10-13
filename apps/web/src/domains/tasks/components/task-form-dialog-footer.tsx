import type { TaskDialogForm } from "@/domains/tasks/components/task-form-dialog-form";
import { Button } from "@/shared/ui/primitives/button";
import { DialogFooter } from "@/shared/ui/primitives/dialog";

type TaskFormDialogFooterProps = {
  form: TaskDialogForm;
  mode: "create" | "edit";
  isBusy: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: () => void | Promise<void>;
};

export function TaskFormDialogFooter({
  form,
  mode,
  isBusy,
  onOpenChange,
  onDelete,
}: TaskFormDialogFooterProps) {
  if (mode === "edit") {
    return (
      <DialogFooter className="sm:justify-between">
        {onDelete ? (
          <Button
            type="button"
            variant="destructive"
            disabled={isBusy}
            onClick={() => {
              void onDelete();
            }}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                disabled={isBusy || !canSubmit || isSubmitting}
              >
                {isBusy || isSubmitting ? "Saving…" : "Save"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </DialogFooter>
    );
  }

  return (
    <DialogFooter>
      <Button
        type="button"
        variant="ghost"
        disabled={isBusy}
        onClick={() => {
          onOpenChange(false);
        }}
      >
        Cancel
      </Button>
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting] as const}
      >
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={isBusy || !canSubmit || isSubmitting}>
            {isBusy || isSubmitting ? "Creating…" : "Create"}
          </Button>
        )}
      </form.Subscribe>
    </DialogFooter>
  );
}
