import {
  columnSizingFeature,
  columnVisibilityFeature,
  createCoreRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Server mode (a declared list), in its own module so a bounded table's route does not ship the
 * selection feature: the table renders, shows sort arrows, hides columns and holds
 * the selection; the server sorts, filters and pages. No sorted, filtered or paginated row
 * model, no global or column filtering, so a forgotten `manual*` flag cannot quietly re-sort a
 * page of rows.
 */
export const serverTableFeatures = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  rowSelectionFeature,
  coreRowModel: createCoreRowModel(),
});

export type ServerTableFeatures = typeof serverTableFeatures;
