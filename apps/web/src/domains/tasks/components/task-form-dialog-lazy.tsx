import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentProps,
} from "react";

import {
  loadTaskFormDialog,
  TASK_DIALOG_PREFETCH_MS,
} from "@/domains/tasks/components/task-form-dialog-load";
import { prefetchImport } from "@/shared/lib/preload-import";

const LoadedTaskFormDialog = lazy(async () => {
  const { TaskFormDialog } = await loadTaskFormDialog();
  return { default: TaskFormDialog };
});

/**
 * The task create and edit dialog behind a lazy boundary: its chunk (the Entity picker, the
 * combobox and selects) is fetched shortly after the screen mounts and at the latest when the
 * dialog first opens, and stays mounted after that so a close keeps its exit animation.
 * Same props as `TaskFormDialog`.
 */
export function LazyTaskFormDialog(
  props: ComponentProps<typeof LoadedTaskFormDialog>
) {
  const [isMounted, setIsMounted] = useState(false);
  if (props.open && !isMounted) setIsMounted(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      void prefetchImport(loadTaskFormDialog);
    }, TASK_DIALOG_PREFETCH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (!isMounted) return null;
  return (
    <Suspense fallback={null}>
      <LoadedTaskFormDialog {...props} />
    </Suspense>
  );
}
