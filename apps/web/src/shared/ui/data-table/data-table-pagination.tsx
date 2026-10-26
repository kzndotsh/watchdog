import type { ReactTable, RowData } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/shared/ui/primitives/button";

import type { BoundedTableFeatures } from "./table-features";

type Props<TData extends RowData> = {
  table: ReactTable<BoundedTableFeatures, TData>;
};

export function DataTablePagination<TData extends RowData>({
  table,
}: Props<TData>) {
  const pageCount = table.getPageCount();
  if (pageCount <= 1) return null;

  const page = table.state.pagination.pageIndex;

  return (
    <div className="text-muted-foreground flex items-center justify-between px-1 py-2 text-sm">
      <span>
        Page {page + 1} of {pageCount} ·{" "}
        {table.getFilteredRowModel().rows.length} total
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous page"
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
          size="icon"
          aria-label="Next page"
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
