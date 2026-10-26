import type { ReactTable, RowData } from "@tanstack/react-table";
import { Settings2Icon } from "lucide-react";
import { lazy, Suspense } from "react";

import type { ListDisplay } from "@/shared/hooks/list/use-list-display";
import { sortOptionLabel } from "@/shared/lib/list/list-copy";
import { isSortValue, sortValuesOf } from "@/shared/lib/list/list-guards";
import type { ListHandle } from "@/shared/lib/list/list-types";
import { prefetchImport } from "@/shared/lib/preload-import";
import type { ServerTableFeatures } from "@/shared/ui/data-table/server-table-features";
import { loadDisplayBody } from "@/shared/ui/list/parts/load-popover-bodies";
import { PopoverBodyFallback } from "@/shared/ui/list/parts/popover-body-fallback";
import { Button } from "@/shared/ui/primitives/button";
import type { AnyListDef, FilterKey } from "@watchdog/schemas/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

const LoadedDisplayBody = lazy(loadDisplayBody);

type ListDisplayButtonProps<
  D extends AnyListDef,
  Item extends RowData,
  K extends FilterKey<D>,
> = {
  readonly list: ListHandle<D, Item, K>;
  readonly display: ListDisplay;
  /** A table's columns for the Columns checklist. */
  readonly table?: ReactTable<ServerTableFeatures, Item>;
  /** Show the Sort list on a table too (its header arrows already sort). Queues always show it. */
  readonly isSortShown?: boolean;
};

/**
 * "Display options", opening one popover of up to three sections:
 *   Columns  the table's hideable columns, checked when shown, and Reset (tables only)
 *   Sort     the declared sorts ("Captured, Newest"); queues and boards, optional on tables
 *   Other    the screen's view toggles and the row density
 * What it changes is the viewer's own (`useListDisplay`, stored locally), except Sort, which is
 * part of the view and so goes to the URL.
 */
export function ListDisplayButton<
  D extends AnyListDef,
  Item extends RowData,
  K extends FilterKey<D>,
>({ list, display, table, isSortShown }: ListDisplayButtonProps<D, Item, K>) {
  const columns =
    table === undefined
      ? []
      : table.getAllLeafColumns().filter((column) => column.getCanHide());
  const sorts = sortValuesOf(list.def);
  const hasSort =
    sorts.length > 1 && (table === undefined || isSortShown === true);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            onPointerEnter={() => {
              void prefetchImport(loadDisplayBody);
            }}
            onFocus={() => {
              void prefetchImport(loadDisplayBody);
            }}
          />
        }
      >
        <Settings2Icon data-icon="inline-start" aria-hidden />
        Display options
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-3">
        <Suspense fallback={<PopoverBodyFallback />}>
          <LoadedDisplayBody
            display={display}
            columns={columns.map((column) => {
              const meta: { label?: string } | undefined =
                column.columnDef.meta;
              return {
                id: column.id,
                label: meta?.label ?? column.id,
                isVisible: column.getIsVisible(),
              };
            })}
            sort={
              hasSort
                ? {
                    value: list.query.sort,
                    options: sorts.map((value) => ({
                      value,
                      label: sortOptionLabel(list.def, value),
                    })),
                  }
                : null
            }
            onSortChange={(value) => {
              if (isSortValue(list.def, value)) list.controls.setSort(value);
            }}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
