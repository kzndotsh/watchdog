import { loadTaskFormDialog } from "@/domains/tasks/components/task-form-dialog-load";
import { lazyOverlay } from "@/shared/lib/lazy-overlay";

/**
 * The task create and edit dialog behind a lazy boundary: its chunk (the Entity picker, the
 * combobox and selects) is fetched shortly after the screen mounts. Same props as `TaskFormDialog`.
 */
export const LazyTaskFormDialog = lazyOverlay(
  loadTaskFormDialog,
  (module) => module.TaskFormDialog,
  { shouldPrefetch: true }
);
