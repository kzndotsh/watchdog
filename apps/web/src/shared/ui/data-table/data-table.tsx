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
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
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

import { ColumnSortContext } from "./column-sort-context";
import type { ServerTableFeatures } from "./server-table-features";

/** The table `DataTable` renders: server mode (`useListTable`, a declared list). */
export type DataTableTable<TData extends RowData> = ReactTable<
  ServerTableFeatures,
  TData
>;

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

/** `aria-sort` for a sortable column header; none on a column that cannot sort. */
function ariaSortOf(column: {
  getCanSort: () => boolean;
  getIsSorted: () => false | "asc" | "desc";
}): "ascending" | "descending" | "none" | undefined {
  if (!column.getCanSort()) return undefined;
  const sorted = column.getIsSorted();
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

type HeaderCell = {
  readonly id: string;
  readonly content: ReactNode;
  readonly ariaSort: ReturnType<typeof ariaSortOf>;
  readonly sorted: false | "asc" | "desc";
};

/** The header rows, rendered. */
function headerRowsOf<TData extends RowData>(
  table: DataTableTable<TData>
): { readonly id: string; readonly headers: HeaderCell[] }[] {
  return table.getHeaderGroups().map((group) => ({
    id: group.id,
    headers: group.headers.map((header) => ({
      id: header.id,
      ariaSort: ariaSortOf(header.column),
      sorted: header.column.getIsSorted(),
      content: header.isPlaceholder
        ? null
        : flexRender(header.column.columnDef.header, header.getContext()),
    })),
  }));
}

function cellsOf(
  cells: readonly { readonly id: string; readonly content: ReactNode }[]
): ReactNode {
  return cells.map((cell) => (
    <TableCell key={cell.id} className="min-w-0 overflow-hidden">
      {cell.content}
    </TableCell>
  ));
}

/** One body row's id, record and rendered cells. */
type BodyRow<TData extends RowData> = {
  readonly id: string;
  readonly original: TData;
  readonly cells: ReactNode;
};

function bodyRowsOf<TData extends RowData>(
  table: DataTableTable<TData>
): BodyRow<TData>[] {
  return table.getRowModel().rows.map((row) => ({
    id: row.id,
    original: row.original,
    cells: cellsOf(
      row.getVisibleCells().map((cell) => ({
        id: cell.id,
        content: flexRender(cell.column.columnDef.cell, cell.getContext()),
      }))
    ),
  }));
}

type DataTableBodyRowProps<TData extends RowData> = {
  row: BodyRow<TData>;
  isSelected: boolean;
  onRowClick?: (row: TData) => void;
  getRowActions?: (row: TData) => readonly AppAction[];
};

function DataTableBodyRow<TData extends RowData>({
  row,
  isSelected,
  onRowClick,
  getRowActions,
}: DataTableBodyRowProps<TData>) {
  const { cells } = row;

  const rowProps = {
    // Selection is the amber wash (DESIGN.md), not the vendored muted fill.
    "data-state": isSelected ? "selected" : undefined,
    "aria-selected": isSelected || undefined,
    className: cn(
      "group data-[state=selected]:bg-signal/10 data-[state=selected]:hover:bg-signal/15",
      onRowClick && "cursor-pointer"
    ),
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
  selectedRowIds,
  onRowClick,
  getRowActions,
  empty,
}: {
  isPending: boolean;
  skeletonRows: number;
  leafColumns: readonly { readonly id: string }[];
  hasRows: boolean;
  table: DataTableTable<TData>;
  selectedRowIds: ReadonlySet<string> | undefined;
  onRowClick?: (row: TData) => void;
  getRowActions?: (row: TData) => readonly AppAction[];
  empty: ReactNode;
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
    return bodyRowsOf(table).map((row) => (
      <DataTableBodyRow
        key={row.id}
        row={row}
        isSelected={selectedRowIds?.has(row.id) === true}
        onRowClick={onRowClick}
        getRowActions={getRowActions}
      />
    ));
  }

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={leafColumns.length}
        className="text-muted-foreground h-16 text-center"
      >
        {empty}
      </TableCell>
    </TableRow>
  );
}

type Props<TData extends RowData> = {
  table: DataTableTable<TData>;
  /** The body when there are no rows: copy, or a full-width node (a list's `ListEmpty`). */
  emptyText?: ReactNode;
  /** Row ids drawn with the selection wash. */
  selectedRowIds?: ReadonlySet<string>;
  /** The previous view's rows stand in for a new one (a list's `isUpdating`): de-emphasised. */
  isUpdating?: boolean;
  /** `compact` rows for a viewer who asked for density (Display options). */
  density?: "comfortable" | "compact";
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
  selectedRowIds,
  isUpdating = false,
  density = "comfortable",
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
        density === "compact" ? "[&_tbody_tr]:h-8" : "[&_tbody_tr]:h-10",
        "[&_td]:py-1 [&_th]:h-8",
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
          {headerRowsOf(table).map((headerRow) => (
            <TableRow key={headerRow.id} className="hover:bg-transparent">
              {headerRow.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="min-w-0 overflow-hidden"
                  aria-sort={header.ariaSort}
                >
                  <ColumnSortContext value={header.sorted}>
                    {header.content}
                  </ColumnSortContext>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className={placeholderDeemphasisClass(isUpdating)}>
          {renderTableBodyRows({
            isPending,
            skeletonRows,
            leafColumns,
            hasRows,
            table,
            selectedRowIds,
            onRowClick,
            getRowActions,
            empty: emptyText,
          })}
          {appendRow}
        </TableBody>
      </Table>
    </div>
  );
}
