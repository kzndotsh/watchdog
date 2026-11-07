import { loadBulkAddDialog } from "@/domains/entities/components/bulk-add-identifiers-dialog-load";
import { lazyOverlay } from "@/shared/lib/lazy-overlay";

/**
 * The bulk-add dialog (the paste mapper and its selects) behind a lazy boundary: its chunk loads
 * when the dialog first opens, or on `warmBulkAddDialog()`. Same props as the dialog.
 */
export const LazyBulkAddIdentifiersDialog = lazyOverlay(
  loadBulkAddDialog,
  (module) => module.BulkAddIdentifiersDialog
);
