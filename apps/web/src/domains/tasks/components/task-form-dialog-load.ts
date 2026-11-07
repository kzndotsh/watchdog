import { memoizeImport } from "@/shared/lib/preload-import";

export const loadTaskFormDialog = memoizeImport(
  async () => import("@/domains/tasks/components/task-form-dialog")
);
