import type { ReactTable, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";

import type { AppAction } from "@/shared/lib/app-action";
import type { ListDensity } from "@/shared/lib/list/list-display-store";
import type { ListHandle } from "@/shared/lib/list/list-types";
import { DataTable } from "@/shared/ui/data-table/data-table";
import type { ServerTableFeatures } from "@/shared/ui/data-table/server-table-features";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { ListEmpty } from "@/shared/ui/list/list-empty";
import { ListFooter } from "@/shared/ui/list/list-footer";
import type { AnyListDef, FilterKey } from "@watchdog/schemas/shared";

type ListTableProps<
  D extends AnyListDef,
  Item extends RowData,
  K extends FilterKey<D>,
> = {
  readonly list: ListHandle<D, Item, K>;
  /** From `useListTable(list, ...)`. */
  readonly table: ReactTable<ServerTableFeatures, Item>;
  /** The viewer's row density (`useListDisplay`). */
  readonly density?: ListDensity;
  readonly onRowClick?: (row: Item) => void;
  readonly getRowActions?: (row: Item) => readonly AppAction[];
  /** Inline composer row(s) after the data rows. */
  readonly appendRow?: ReactNode;
  /** The screen's add action for "No <noun> yet". */
  readonly blankSlateAction?: ReactNode;
};

/**
 * `ListBody` for tables (tables.md: `DataTable` owns its skeleton, never a `PendingRegion`): the
 * per-cell skeleton while pending, header arrows with `aria-sort` on the declared sort columns
 * only, the error, blank and no-match states as one full-width row under the real header, the
 * selection wash on selected rows, then the footer (count, Load more, the ceiling). There are
 * no client pages, so no `DataTablePagination`.
 */
export function ListTable<
  D extends AnyListDef,
  Item extends RowData,
  K extends FilterKey<D>,
>({
  list,
  table,
  density,
  onRowClick,
  getRowActions,
  appendRow,
  blankSlateAction,
}: ListTableProps<D, Item, K>) {
  const { status, def } = list;
  let empty: ReactNode = null;
  if (status === "error") {
    empty = (
      <FetchErrorAlert
        error={list.error}
        onRetry={() => {
          list.retry();
        }}
      />
    );
  } else if (status === "blank" || status === "no-match") {
    empty = (
      <ListEmpty
        status={status}
        noun={def.noun}
        action={blankSlateAction}
        onClearFilters={() => {
          list.controls.reset();
        }}
        size="sm"
      />
    );
  }
  return (
    <div data-slot="list-table" className="flex min-h-0 flex-col gap-2">
      {status === "ready" ? (
        <FetchErrorAlert
          error={list.error}
          onRetry={() => {
            list.retry();
          }}
        />
      ) : null}
      <DataTable
        table={table}
        isPending={status === "pending"}
        pendingLabel={`Loading ${def.noun.many}`}
        emptyText={empty}
        isUpdating={list.isUpdating}
        selectedRowIds={list.selection.ids}
        density={density}
        onRowClick={onRowClick}
        getRowActions={getRowActions}
        appendRow={appendRow}
      />
      <ListFooter
        status={status}
        count={list.count}
        more={list.more}
        noun={def.noun}
      />
    </div>
  );
}
