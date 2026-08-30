import { flexRender } from "@tanstack/react-table";
import type { Table as TanstackTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
/**
 * TanStack table shell — `table-fixed` + `<colgroup>` from column `size`.
 *
 * **Loading:** pass `pending` + `pendingLabel` — renders one skeleton bar per
 * cell under the mounted header. Never wrap table bodies in `PendingRegion`
 * (flex skeleton rows misalign with the column grid). See
 * `apps/web/docs/UI.md` § Tables.
 */

import { cn } from "@/lib/utils";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/shadcn/table";
import { TABLE_BODY_SKELETON_ROW_COUNT } from "@/shared/ui/skeletons";

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

function renderTableBodyRows<TData>({
  pending,
  skeletonRows,
  leafColumns,
  hasRows,
  table,
  onRowClick,
  emptyText,
}: {
  pending: boolean;
  skeletonRows: number;
  leafColumns: ReturnType<TanstackTable<TData>["getVisibleLeafColumns"]>;
  hasRows: boolean;
  table: TanstackTable<TData>;
  onRowClick?: (row: TData) => void;
  emptyText: string;
}) {
  if (pending) {
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
    return table.getRowModel().rows.map((row) => (
      <TableRow
        key={row.id}
        className={onRowClick ? "cursor-pointer" : undefined}
        onPointerDown={
          onRowClick
            ? (e) => {
                if (e.button !== 0) return;
                e.currentTarget.dataset.wdRowClickArmed = shouldIgnoreRowClick(
                  e.target
                )
                  ? "0"
                  : "1";
              }
            : undefined
        }
        onClick={
          onRowClick
            ? (e) => {
                const armed = e.currentTarget.dataset.wdRowClickArmed === "1";
                e.currentTarget.dataset.wdRowClickArmed = "";
                if (!armed) return;
                if (shouldIgnoreRowClick(e.target)) return;
                onRowClick(row.original);
              }
            : undefined
        }
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="overflow-hidden">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
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

interface Props<TData> {
  table: TanstackTable<TData>;
  emptyText?: string;
  className?: string;
  onRowClick?: (row: TData) => void;
  /** Extra row(s) appended after data rows — used for inline add composers. */
  appendRow?: ReactNode;
  /** When true, tbody renders skeleton rows; colgroup + header stay mounted. */
  pending?: boolean;
  skeletonRows?: number;
  /** Screen-reader label while `pending`. Uses per-cell skeleton rows. */
  pendingLabel?: string;
}

export function DataTable<TData>({
  table,
  emptyText = "No results.",
  className,
  onRowClick,
  appendRow,
  pending = false,
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
      aria-busy={pending || undefined}
      className={cn(
        "overflow-hidden rounded-lg border text-xs",
        "[&_tbody_tr]:h-10 [&_td]:py-1 [&_th]:h-8",
        className
      )}
    >
      {pending ? (
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
        <TableHeader className="bg-muted/80 sticky top-0 z-10 backdrop-blur">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="overflow-hidden">
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
            pending,
            skeletonRows,
            leafColumns,
            hasRows,
            table,
            onRowClick,
            emptyText,
          })}
          {appendRow}
        </TableBody>
      </Table>
    </div>
  );
}
