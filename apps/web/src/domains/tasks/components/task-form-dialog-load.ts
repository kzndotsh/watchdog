import { memoizeImport } from "@/shared/lib/preload-import";

export const loadTaskFormDialog = memoizeImport(
  async () => import("@/domains/tasks/components/task-form-dialog")
);

/** How long after a Tasks screen mounts its dialog chunk is fetched, so the first open is instant. */
export const TASK_DIALOG_PREFETCH_MS = 1500;
