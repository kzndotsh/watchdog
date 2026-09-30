import type { TaskDialogForm } from "@/domains/tasks/components/task-form-dialog-form";
import { Button } from "@/shared/ui/primitives/button";
import { DialogFooter } from "@/shared/ui/primitives/dialog";

export function TaskFormDialogFooter({
  form,
  mode,
  busy,
  onOpenChange,
  onDelete,
}: {
  form: TaskDialogForm;
  mode: "create" | "edit";
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: () => void | Promise<void>;
}) {
  if (mode === "edit") {
    return (
      <DialogFooter className="sm:justify-between">
        {onDelete ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
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
            disabled={busy}
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
                disabled={busy || !canSubmit || isSubmitting}
              >
                {busy || isSubmitting ? "Saving…" : "Save"}
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
        disabled={busy}
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
          <Button type="submit" disabled={busy || !canSubmit || isSubmitting}>
            {busy || isSubmitting ? "Creating…" : "Create"}
          </Button>
        )}
      </form.Subscribe>
    </DialogFooter>
  );
}
