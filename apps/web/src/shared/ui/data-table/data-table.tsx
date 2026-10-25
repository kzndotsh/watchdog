import { flexRender } from "@tanstack/react-table";
import type { ReactTable, RowData } from "@tanstack/react-table";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
/**
 * TanStack table shell — `table-fixed` + `<colgroup>` from column `size`.
 *
 * **Loading:** pass `isPending` + `pendingLabel` — renders one skeleton bar per
 * cell under the mounted header, in the server HTML too (the empty text never shows
 * first). Never wrap table bodies in `PendingRegion`
 * (flex skeleton rows misalign with the column grid). See
 * `docs/reference/web/ui/tables.md`.
 *
 * Optional `getRowActions` wraps body rows in a ContextMenu (editables skipped).
 */

import { cn } from "@/lib/utils";
import type { AppAction } from "@/shared/lib/app-action";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import { TABLE_BODY_SKELETON_ROW_COUNT } from "@/shared/ui/skeletons";
import { Skeleton } from "@watchdog/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@watchdog/ui/components/table";

import type { DataTableFeatures } from "./table-features";

/**
 * Portaled menus unmount before click — arm on pointerdown so leftover
 * clicks on the row do not navigate.
 */
const ROW_CLICK_IGNORE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "[role='option']",
  "[role='listbox']",
  "[role='combobox']",
  "[data-slot='combobox-item']",
  "[data-slot='select-item']",
].join(", ");

function shouldIgnoreRowClick(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(ROW_CLICK_IGNORE_SELECTOR) !== null
  );
}

type DataTableBodyRowProps<TData extends RowData> = {
  row: ReturnType<
    ReactTable<DataTableFeatures, TData>["getRowModel"]
  >["rows"][number];
  onRowClick?: (row: TData) => void;
  getRowActions?: (row: TData) => readonly AppAction[];
  /** `table.options.columns`, passed so a change of the column defs re-renders the cells (see below). */
  columns: ReactTable<DataTableFeatures, TData>["options"]["columns"];
};

function DataTableBodyRow<TData extends RowData>({
  row,
  onRowClick,
  getRowActions,
  columns,
}: DataTableBodyRowProps<TData>) {
  // A cell renderer closes over its table's actions (the column factory), so new actions mean
  // new column defs. A cell context is stable while the row is, and React Compiler memoizes
  // the table body and this row on their inputs, so a change that leaves the rows as they
  // were (a connection linked or unlinked: the rows refetch to the same data) would never
  // reach the cells. Taking `columns` as a prop and putting it into the context makes it an
  // input of both memos.
  const cells = row.getVisibleCells().map((cell) => (
    <TableCell key={cell.id} className="min-w-0 overflow-hidden">
      {flexRender(cell.column.columnDef.cell, {
        ...cell.getContext(),
        columns,
      })}
    </TableCell>
  ));

  const rowProps = {
    className: onRowClick ? "group cursor-pointer" : "group",
    onPointerDown: onRowClick
      ? (e: ReactPointerEvent<HTMLTableRowElement>) => {
          if (e.button !== 0) return;
          e.currentTarget.dataset.wdRowClickArmed = shouldIgnoreRowClick(
            e.target
          )
            ? "0"
            : "1";
        }
      : undefined,
    onClick: onRowClick
      ? (e: ReactMouseEvent<HTMLTableRowElement>) => {
          const isArmed = e.currentTarget.dataset.wdRowClickArmed === "1";
          e.currentTarget.dataset.wdRowClickArmed = "";
          if (!isArmed) return;
          if (shouldIgnoreRowClick(e.target)) return;
          onRowClick(row.original);
        }
      : undefined,
  };

  const actions = getRowActions?.(row.original);
  if (actions && actions.length > 0) {
    return (
      <ActionsContextMenu
        actions={actions}
        trigger={<TableRow {...rowProps} />}
      >
        {cells}
      </ActionsContextMenu>
    );
  }

  return <TableRow {...rowProps}>{cells}</TableRow>;
}

function renderTableBodyRows<TData extends RowData>({
  isPending,
  skeletonRows,
  leafColumns,
  hasRows,
  table,
  onRowClick,
  getRowActions,
  emptyText,
  columns,
}: {
  isPending: boolean;
  skeletonRows: number;
  leafColumns: ReturnType<
    ReactTable<DataTableFeatures, TData>["getVisibleLeafColumns"]
  >;
  hasRows: boolean;
  table: ReactTable<DataTableFeatures, TData>;
  onRowClick?: (row: TData) => void;
  getRowActions?: (row: TData) => readonly AppAction[];
  emptyText: string;
  columns: ReactTable<DataTableFeatures, TData>["options"]["columns"];
}) {
  if (isPending) {
    return Array.from({ length: skeletonRows }).map((_, rowIndex) => (
      <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
        {leafColumns.map((col, colIndex) => (
          <TableCell key={col.id} className="overflow-hidden">
            <Skeleton
              className={cn(
                "h-2.5",
                colIndex === 0 ? "w-32" : "w-16 max-w-full"
              )}
            />
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  if (hasRows) {
    return table
      .getRowModel()
      .rows.map((row) => (
        <DataTableBodyRow
          key={row.id}
          row={row}
          onRowClick={onRowClick}
          getRowActions={getRowActions}
          columns={columns}
        />
      ));
  }

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={leafColumns.length}
        className="text-muted-foreground h-16 text-center"
      >
        {emptyText}
      </TableCell>
    </TableRow>
  );
}

type Props<TData extends RowData> = {
  table: ReactTable<DataTableFeatures, TData>;
  emptyText?: string;
  className?: string;
  onRowClick?: (row: TData) => void;
  /** Row ContextMenu actions (target only — chrome lives on inset). */
  getRowActions?: (row: TData) => readonly AppAction[];
  /** Extra row(s) appended after data rows — used for inline add composers. */
  appendRow?: ReactNode;
  /** When true, tbody renders skeleton rows; colgroup + header stay mounted. */
  isPending?: boolean;
  skeletonRows?: number;
  /** Screen-reader label while `isPending`. Uses per-cell skeleton rows. */
  pendingLabel?: string;
};

export function DataTable<TData extends RowData>({
  table,
  emptyText = "No results.",
  className,
  onRowClick,
  getRowActions,
  appendRow,
  isPending = false,
  skeletonRows = TABLE_BODY_SKELETON_ROW_COUNT,
  pendingLabel = "Loading table",
}: Props<TData>) {
  const leafColumns = table.getVisibleLeafColumns();
  const hasRows = table.getRowModel().rows.length > 0;
  const totalSize = Math.max(
    leafColumns.reduce((sum, col) => sum + col.getSize(), 0),
    1
  );

  return (
    <div
      aria-busy={isPending || undefined}
      className={cn(
        "overflow-hidden rounded-lg border text-sm",
        "[&_tbody_tr]:h-10 [&_td]:py-1 [&_th]:h-8",
        className
      )}
    >
      {isPending ? (
        <span className="sr-only" role="status">
          {pendingLabel}
        </span>
      ) : null}
      <Table className="w-full table-fixed">
        <colgroup>
          {leafColumns.map((col) => (
            <col
              key={col.id}
              style={{ width: `${(col.getSize() / totalSize) * 100}%` }}
            />
          ))}
        </colgroup>
        <TableHeader className="bg-background sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="min-w-0 overflow-hidden">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {renderTableBodyRows({
            isPending,
            skeletonRows,
            leafColumns,
            hasRows,
            table,
            onRowClick,
            getRowActions,
            emptyText,
            columns: table.options.columns,
          })}
          {appendRow}
        </TableBody>
      </Table>
    </div>
  );
}
