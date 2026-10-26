import type { ReactTable, RowData } from "@tanstack/react-table";
import { Settings2Icon } from "lucide-react";
import { useId, type ReactNode } from "react";

import type { ListDisplay } from "@/shared/hooks/list/use-list-display";
import { sortOptionLabel } from "@/shared/lib/list/list-copy";
import { isSortValue, sortValuesOf } from "@/shared/lib/list/list-guards";
import type { ListHandle } from "@/shared/lib/list/list-types";
import type { ServerTableFeatures } from "@/shared/ui/data-table/server-table-features";
import { Button } from "@/shared/ui/primitives/button";
import type { AnyListDef, FilterKey } from "@watchdog/schemas/shared";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";
import {
  RadioGroup,
  RadioGroupItem,
} from "@watchdog/ui/components/radio-group";
import { Switch } from "@watchdog/ui/components/switch";

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

function DisplaySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h3 className="text-muted-foreground text-2xs font-medium">{title}</h3>
      {children}
    </section>
  );
}

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
  const idPrefix = useId();
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
        render={<Button type="button" variant="outline" size="lg" />}
      >
        <Settings2Icon data-icon="inline-start" aria-hidden />
        Display options
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-3">
        {columns.length > 0 ? (
          <DisplaySection title="Columns">
            <ul className="flex flex-col gap-1">
              {columns.map((column) => {
                const meta: { label?: string } | undefined =
                  column.columnDef.meta;
                const id = `${idPrefix}-column-${column.id}`;
                return (
                  <li key={column.id} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(checked) => {
                        display.setColumnVisible(column.id, checked);
                      }}
                    />
                    <label htmlFor={id} className="text-xs">
                      {meta?.label ?? column.id}
                    </label>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                display.resetColumns();
              }}
            >
              Reset
            </Button>
          </DisplaySection>
        ) : null}
        {hasSort ? (
          <DisplaySection title="Sort">
            <RadioGroup
              aria-label="Sort"
              value={list.query.sort}
              className="gap-1.5"
              onValueChange={(value) => {
                if (typeof value === "string" && isSortValue(list.def, value)) {
                  list.controls.setSort(value);
                }
              }}
            >
              {sorts.map((value) => {
                const id = `${idPrefix}-sort-${value}`;
                return (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem id={id} value={value} />
                    <label htmlFor={id} className="text-xs">
                      {sortOptionLabel(list.def, value)}
                    </label>
                  </div>
                );
              })}
            </RadioGroup>
          </DisplaySection>
        ) : null}
        <DisplaySection title="Other">
          {display.toggles.map((toggle) => {
            const id = `${idPrefix}-toggle-${toggle.id}`;
            return (
              <div key={toggle.id} className="flex items-center gap-2">
                <Switch
                  id={id}
                  checked={display.isToggleOn(toggle.id)}
                  onCheckedChange={(checked) => {
                    display.setToggle(toggle.id, checked);
                  }}
                />
                <label htmlFor={id} className="text-xs">
                  {toggle.label}
                </label>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <Switch
              id={`${idPrefix}-density`}
              checked={display.density === "compact"}
              onCheckedChange={(checked) => {
                display.setDensity(checked ? "compact" : "comfortable");
              }}
            />
            <label htmlFor={`${idPrefix}-density`} className="text-xs">
              Compact rows
            </label>
          </div>
        </DisplaySection>
      </PopoverContent>
    </Popover>
  );
}
