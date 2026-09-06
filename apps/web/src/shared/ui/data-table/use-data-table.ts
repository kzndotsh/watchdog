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
  type TableMeta,
} from "@tanstack/react-table";
import { useState } from "react";

import { dataTableFeatures, type DataTableFeatures } from "./table-features";

export interface UseDataTableOptions<
  TData extends RowData,
  TMeta = Record<string, unknown>,
> {
  data: TData[];
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
}

export function useDataTable<
  TData extends RowData,
  TMeta = Record<string, unknown>,
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
    // Call-site TMeta is checked by UseDataTableOptions; TanStack's TableMeta is module-aug only.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bridge generic TMeta into TanStack's empty TableMeta slot
    meta: meta as TableMeta<DataTableFeatures, TData> | undefined,
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
