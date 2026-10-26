import { lazy, Suspense, useState, type ComponentProps } from "react";

import { loadBulkAddDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog-load";

const LoadedBulkAddDialog = lazy(async () => {
  const { BulkAddIdentifiersDialog } = await loadBulkAddDialog();
  return { default: BulkAddIdentifiersDialog };
});

/**
 * The bulk-add dialog (the paste mapper and its selects) behind a lazy boundary: its chunk loads
 * when the dialog first opens, or on `warmBulkAddDialog()`, and the dialog then stays mounted so a
 * close keeps its exit animation. Same props as the dialog.
 */
export function LazyBulkAddIdentifiersDialog(
  props: ComponentProps<typeof LoadedBulkAddDialog>
) {
  const [isMounted, setIsMounted] = useState(false);
  if (props.open && !isMounted) setIsMounted(true);
  if (!isMounted) return null;
  return (
    <Suspense fallback={null}>
      <LoadedBulkAddDialog {...props} />
    </Suspense>
  );
}
