import { PlusIcon } from "lucide-react";

import type { AnyFilterSource } from "@/shared/lib/list/list-types";
import { ListFilterRow } from "@/shared/ui/list/list-filter-row";
import { Button } from "@/shared/ui/primitives/button";
import type { AnyFilter } from "@watchdog/schemas/shared";

export type FilterRowModel = {
  readonly key: string;
  readonly fields: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly filter: AnyFilter;
  readonly value: unknown;
  readonly source: AnyFilterSource | undefined;
};

export type FiltersPopoverBodyProps = {
  readonly rows: readonly FilterRowModel[];
  readonly focusKey: string | null;
  readonly canAdd: boolean;
  readonly hasActive: boolean;
  readonly onFieldChange: (from: string, to: string) => void;
  readonly onValueChange: (key: string, value: unknown) => void;
  readonly onRemove: (key: string) => void;
  readonly onAdd: () => void;
  readonly onClearAll: () => void;
};

/**
 * The Filters popover's contents, loaded on first open (`ListFiltersButton` owns the state and
 * hands in plain rows, so this chunk carries the value controls and not the list's generics):
 *
 *   [ Kind      ▾ ] [ URL, File        ▾ ]  ×
 *   [ Hidden    ▾ ] [ ● On               ]  ×
 *   + Add filter                    Clear all
 */
export default function FiltersPopoverBody({
  rows,
  focusKey,
  canAdd,
  hasActive,
  onFieldChange,
  onValueChange,
  onRemove,
  onAdd,
  onClearAll,
}: FiltersPopoverBodyProps) {
  return (
    <>
      {rows.length === 0 ? (
        <p className="text-muted-foreground px-1 text-xs">
          No filters applied.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <ListFilterRow
              key={row.key}
              fieldKey={row.key}
              fields={row.fields}
              filter={row.filter}
              value={row.value}
              source={row.source}
              shouldFocusValue={focusKey === row.key}
              onFieldChange={(to) => {
                onFieldChange(row.key, to);
              }}
              onValueChange={(value) => {
                onValueChange(row.key, value);
              }}
              onRemove={() => {
                onRemove(row.key);
              }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canAdd}
          onClick={onAdd}
        >
          <PlusIcon data-icon="inline-start" aria-hidden />
          Add filter
        </Button>
        {hasActive ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClearAll}>
            Clear all
          </Button>
        ) : null}
      </div>
    </>
  );
}
