import { useId, type ReactNode } from "react";

import type { ListDisplay } from "@/shared/hooks/list/use-list-display";
import { Button } from "@/shared/ui/primitives/button";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import {
  RadioGroup,
  RadioGroupItem,
} from "@watchdog/ui/components/radio-group";
import { Switch } from "@watchdog/ui/components/switch";

export type DisplayPopoverBodyProps = {
  readonly display: ListDisplay;
  /** The table's hideable columns (none: no Columns section). */
  readonly columns: readonly {
    readonly id: string;
    readonly label: string;
    readonly isVisible: boolean;
  }[];
  /** The declared sorts, or `null` when the Sort section is not shown. */
  readonly sort: {
    readonly value: string;
    readonly options: readonly {
      readonly value: string;
      readonly label: string;
    }[];
  } | null;
  readonly onSortChange: (value: string) => void;
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
 * The Display options popover's contents, loaded on first open: up to three sections.
 *   Columns  the table's hideable columns, checked when shown, and Reset (tables only)
 *   Sort     the declared sorts ("Captured, Newest"); queues and boards, optional on tables
 *   Other    the screen's view toggles and the row density
 */
export default function DisplayPopoverBody({
  display,
  columns,
  sort,
  onSortChange,
}: DisplayPopoverBodyProps) {
  const idPrefix = useId();
  return (
    <>
      {columns.length > 0 ? (
        <DisplaySection title="Columns">
          <ul className="flex flex-col gap-1">
            {columns.map((column) => {
              const id = `${idPrefix}-column-${column.id}`;
              return (
                <li key={column.id} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={column.isVisible}
                    onCheckedChange={(checked) => {
                      display.setColumnVisible(column.id, checked);
                    }}
                  />
                  <label htmlFor={id} className="text-xs">
                    {column.label}
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
      {sort === null ? null : (
        <DisplaySection title="Sort">
          <RadioGroup
            aria-label="Sort"
            value={sort.value}
            className="gap-1.5"
            onValueChange={(value) => {
              if (typeof value === "string") onSortChange(value);
            }}
          >
            {sort.options.map((option) => {
              const id = `${idPrefix}-sort-${option.value}`;
              return (
                <div key={option.value} className="flex items-center gap-2">
                  <RadioGroupItem id={id} value={option.value} />
                  <label htmlFor={id} className="text-xs">
                    {option.label}
                  </label>
                </div>
              );
            })}
          </RadioGroup>
        </DisplaySection>
      )}
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
    </>
  );
}
