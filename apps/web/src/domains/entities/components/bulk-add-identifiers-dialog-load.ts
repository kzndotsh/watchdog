import { memoizeImport, prefetchImport } from "@/shared/lib/preload-import";

export const loadBulkAddDialog = memoizeImport(
  async () =>
    import("@/domains/entities/components/bulk-add-identifiers-dialog")
);

/** Pointer enter or focus on the control that opens the dialog. */
export function warmBulkAddDialog(): void {
  void prefetchImport(loadBulkAddDialog);
}
