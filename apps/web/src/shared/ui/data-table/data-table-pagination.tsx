import type { ReactTable, RowData } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";

import type { DataTableFeatures } from "./table-features";

interface Props<TData extends RowData> {
  table: ReactTable<DataTableFeatures, TData>;
}

export function DataTablePagination<TData extends RowData>({
  table,
}: Props<TData>) {
  const pageCount = table.getPageCount();
  if (pageCount <= 1) return null;

  const page = table.state.pagination.pageIndex;

  return (
    <div className="text-muted-foreground flex items-center justify-between px-1 py-2 text-xs">
      <span>
        Page {page + 1} of {pageCount} ·{" "}
        {table.getFilteredRowModel().rows.length} total
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={!table.getCanPreviousPage()}
          onClick={() => {
            table.previousPage();
          }}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={!table.getCanNextPage()}
          onClick={() => {
            table.nextPage();
          }}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
