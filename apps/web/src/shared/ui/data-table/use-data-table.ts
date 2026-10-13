import {
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type OnChangeFn,
  type ReactTable,
  type RowData,
  type ColumnVisibilityState,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";

import { dataTableFeatures, type DataTableFeatures } from "./table-features";

export type UseDataTableOptions<
  TData extends RowData,
  TMeta extends object = Record<string, unknown>,
> = {
  data: readonly TData[];
  columns: ColumnDef<DataTableFeatures, TData>[];
  meta?: TMeta;
  getRowId?: (row: TData) => string;
  initialSorting?: SortingState;
  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  globalFilterFn?: FilterFn<DataTableFeatures, TData>;
  pageSize?: number;
};

export function useDataTable<
  TData extends RowData,
  TMeta extends object = Record<string, unknown>,
>(
  options: UseDataTableOptions<TData, TMeta>
): {
  table: ReactTable<DataTableFeatures, TData>;
} {
  const {
    data,
    columns,
    meta,
    getRowId,
    initialSorting = [],
    globalFilter: controlledGlobalFilter,
    onGlobalFilterChange: controlledOnGlobalFilterChange,
    columnFilters: controlledColumnFilters,
    onColumnFiltersChange: controlledOnColumnFiltersChange,
    globalFilterFn,
    pageSize = 25,
  } = options;

  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [internalFilters, setInternalFilters] = useState<ColumnFiltersState>(
    []
  );
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});

  const columnFilters = controlledColumnFilters ?? internalFilters;
  const onColumnFiltersChange =
    controlledOnColumnFiltersChange ?? setInternalFilters;
  const globalFilter = controlledGlobalFilter ?? internalGlobalFilter;
  const onGlobalFilterChange =
    controlledOnGlobalFilterChange ?? setInternalGlobalFilter;

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    // TanStack's TableMeta is an empty interface (module-aug only); any object fits.
    meta,
    getRowId,
    globalFilterFn,
    initialState: { pagination: { pageIndex: 0, pageSize } },
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange,
    onSortingChange: setSorting,
    state: { columnFilters, columnVisibility, globalFilter, sorting },
  });

  return { table };
}
