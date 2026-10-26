import {
  columnFilteringFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createCoreRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Client mode: every row is loaded and the table sorts, filters and pages them itself. Only for
 * a bounded table whose whole set is in memory (`useDataTable`); a declared list uses
 * `serverTableFeatures` through `useListTable`.
 */
export const boundedTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  rowPaginationFeature,
  coreRowModel: createCoreRowModel(),
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
  },
});

export type BoundedTableFeatures = typeof boundedTableFeatures;
