import type { ReactTable, RowData } from "@tanstack/react-table";
import { Settings2Icon } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/shadcn/dropdown-menu";

import type { DataTableFeatures } from "./table-features";

interface Props<TData extends RowData> {
  table: ReactTable<DataTableFeatures, TData>;
}

export function DataTableViewOptions<TData extends RowData>({
  table,
}: Props<TData>) {
  const columns = table.getAllColumns().filter((col) => col.getCanHide());
  const visibleCount = columns.filter((col) => col.getIsVisible()).length;
  const totalCount = columns.length;
  const allVisible = totalCount > 0 && visibleCount === totalCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            aria-label={`Fields ${visibleCount} of ${totalCount}`}
          />
        }
      >
        <Settings2Icon className="size-4" />
        {totalCount > 0 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {visibleCount}/{totalCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[14rem]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>Fields</span>
            {allVisible ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  table.resetColumnVisibility();
                }}
                className="h-auto px-1.5 py-0.5 text-xs"
              >
                Show all
              </Button>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map((column) => {
            const meta: { label?: string } | undefined = column.columnDef.meta;
            const label = meta?.label ?? column.id;
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => {
                  column.toggleVisibility(value);
                }}
              >
                {label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
