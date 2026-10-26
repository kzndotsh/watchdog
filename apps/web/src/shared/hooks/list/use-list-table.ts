import {
  functionalUpdate,
  useTable,
  type ColumnDef,
  type ReactTable,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

import type { ListDisplay } from "@/shared/hooks/list/use-list-display";
import { isSortValue } from "@/shared/lib/list/list-guards";
import type { ListHandle } from "@/shared/lib/list/list-types";
import {
  serverTableFeatures,
  type ServerTableFeatures,
} from "@/shared/ui/data-table/server-table-features";
import {
  opsOf,
  type AnyListDef,
  type FilterKey,
  type SortKey,
} from "@watchdog/schemas/shared";

type UseListTableOptions<D extends AnyListDef, Item extends RowData> = {
  readonly columns: readonly ColumnDef<ServerTableFeatures, Item>[];
  /** Declared sort key → the column that shows its arrow. Other columns never sort. */
  readonly sortColumns?: Partial<Record<SortKey<D>, string>>;
  readonly display: ListDisplay;
};

/**
 * TanStack lets only a column with an accessor sort. In server mode the value is never read (the
 * server sorts), so a declared sort column without one gets this.
 */
function sortOnlyAccessor(): null {
  return null;
}

/** A column's id as TanStack resolves it: `id`, else `accessorKey`. */
function columnIdOf<Item extends RowData>(
  column: ColumnDef<ServerTableFeatures, Item>
): string {
  if (typeof column.id === "string") return column.id;
  const key: unknown = "accessorKey" in column ? column.accessorKey : undefined;
  return typeof key === "string" ? key : "";
}

/**
 * TanStack Table v9 over a list, in server mode: the table renders, shows sort arrows, hides
 * columns and holds the selection; it never sorts, filters or pages (`serverTableFeatures` has
 * no client row models, and `manualSorting` is on regardless).
 *
 * - The sorting state comes from `list.query.sort` through `sortColumns`; a header click maps
 *   back to the declared sort (a new column starts at its first declared direction), so a
 *   header can only offer an indexed sort. Columns outside `sortColumns` cannot sort.
 * - `getRowId` is the view's `getId` (required), and the row selection is `list.selection`.
 * - Column visibility is `display` (`useListDisplay`), shared with the Display options popover.
 */
export function useListTable<
  D extends AnyListDef,
  Item extends RowData,
  K extends FilterKey<D> = never,
>(
  list: ListHandle<D, Item, K>,
  opts: UseListTableOptions<D, Item>
): { readonly table: ReactTable<ServerTableFeatures, Item> } {
  const { def } = list;
  const ops = opsOf(def);
  const { display } = opts;
  const sortColumns: Readonly<Partial<Record<string, string>>> =
    opts.sortColumns ?? {};
  const keyByColumn = new Map(
    Object.entries(sortColumns).flatMap(([key, columnId]) =>
      columnId === undefined ? [] : [[columnId, key] as const]
    )
  );
  const columns = opts.columns.map((column) => {
    if (!keyByColumn.has(columnIdOf(column))) {
      return { ...column, enableSorting: false };
    }
    const hasAccessor = "accessorFn" in column || "accessorKey" in column;
    return hasAccessor
      ? { ...column, enableSorting: true }
      : { ...column, enableSorting: true, accessorFn: sortOnlyAccessor };
  });

  const current = ops.sortParts(list.query.sort);
  const currentColumn = sortColumns[current.key];
  const sorting: SortingState =
    currentColumn === undefined
      ? []
      : [{ id: currentColumn, desc: current.dir === "desc" }];
  const rowSelection: RowSelectionState = Object.fromEntries(
    [...list.selection.ids].map((id) => [id, true] as const)
  );

  const table = useTable({
    features: serverTableFeatures,
    columns,
    data: list.rows,
    getRowId: list.getId,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: {
      sorting,
      columnVisibility: display.columnVisibility,
      rowSelection,
    },
    onSortingChange: (updater) => {
      const [next] = functionalUpdate(updater, sorting);
      if (next === undefined) return;
      const key = keyByColumn.get(next.id);
      const declared = key === undefined ? undefined : def.sorts[key];
      if (key === undefined || declared === undefined) return;
      const asked = next.desc ? "desc" : "asc";
      // A column that was not the sort starts at its first declared direction.
      const dir =
        key === current.key && declared.dirs.includes(asked)
          ? asked
          : declared.dirs[0];
      const value = `${key}.${dir}`;
      if (isSortValue(def, value)) list.controls.setSort(value);
    },
    onColumnVisibilityChange: (updater) => {
      display.setColumnVisibility(
        functionalUpdate(updater, display.columnVisibility)
      );
    },
    onRowSelectionChange: (updater) => {
      const next = functionalUpdate(updater, rowSelection);
      list.selection.setIds(new Set(Object.keys(next)));
    },
  });

  return { table };
}
