import { ListFilterIcon, PlusIcon } from "lucide-react";
import { useState, type Ref } from "react";

import { activeFilterKeys } from "@/shared/lib/list/list-filters";
import { isFilterKey, isQueryValue } from "@/shared/lib/list/list-guards";
import type { AnyFilterSource, ListHandle } from "@/shared/lib/list/list-types";
import { ListFilterRow } from "@/shared/ui/list/list-filter-row";
import { Button } from "@/shared/ui/primitives/button";
import { TabCount } from "@/shared/ui/tab-count";
import {
  emptyFilterValue,
  isActiveFilterValue,
  type AnyListDef,
  type FilterKey,
} from "@watchdog/schemas/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

type ListFiltersButtonProps<
  D extends AnyListDef,
  Item,
  K extends FilterKey<D>,
> = {
  readonly list: ListHandle<D, Item, K>;
  /** The screen's `ref` / `tags` option sources, by filter name. */
  readonly sources: Readonly<Partial<Record<string, AnyFilterSource>>>;
  /** The trigger, so a removed chip can hand focus back to it. */
  readonly triggerRef?: Ref<HTMLButtonElement>;
};

/**
 * "Filters" with a count of the active filters, opening one popover:
 *
 *   [ Kind      ▾ ] [ URL, File        ▾ ]  ×
 *   [ Hidden    ▾ ] [ ● On               ]  ×
 *   + Add filter                    Clear all
 *
 * One `ListFilterRow` per active filter, then the rows added in this opening that have no value
 * yet (dropped when the popover closes). Every change applies at once as one URL replace; there
 * is no Apply. Fixed filters, and filters a fixed one locks, are never offered.
 */
export function ListFiltersButton<
  D extends AnyListDef,
  Item,
  K extends FilterKey<D>,
>({ list, sources, triggerRef }: ListFiltersButtonProps<D, Item, K>) {
  const { def, controls } = list;
  const [isOpen, setIsOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<readonly FilterKey<D>[]>([]);
  const [focusKey, setFocusKey] = useState<FilterKey<D> | null>(null);

  const active = activeFilterKeys(list);
  const rows = [
    ...active,
    ...draftKeys.filter(
      (key) => !active.includes(key) && controls.availableFilters.includes(key)
    ),
  ];
  const unused = controls.availableFilters.filter((key) => !rows.includes(key));

  const keepRow = (key: FilterKey<D>) => {
    if (!draftKeys.includes(key)) setDraftKeys([...draftKeys, key]);
  };
  const dropRow = (key: FilterKey<D>) => {
    setDraftKeys(draftKeys.filter((draft) => draft !== key));
  };

  const handleValueChange = (key: FilterKey<D>, value: unknown) => {
    if (!isQueryValue(def, key, value)) return;
    // A row whose value goes back to empty stays in the popover until it closes.
    if (!isActiveFilterValue(def.filters[key], value)) keepRow(key);
    controls.setFilter(key, value);
  };

  const handleFieldChange = (from: FilterKey<D>, to: string) => {
    if (!isFilterKey(def, to) || to === from) return;
    setDraftKeys([...draftKeys.filter((key) => key !== from), to]);
    setFocusKey(to);
    if (active.includes(from)) controls.removeFilter(from);
  };

  const handleRemove = (key: FilterKey<D>) => {
    dropRow(key);
    if (active.includes(key)) controls.removeFilter(key);
  };

  const handleAdd = () => {
    const [next] = unused;
    if (next === undefined) return;
    setDraftKeys([...draftKeys, next]);
    setFocusKey(next);
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setDraftKeys([]);
          setFocusKey(null);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="lg"
            aria-label={
              active.length > 0 ? `Filters, ${active.length} active` : "Filters"
            }
          />
        }
      >
        <ListFilterIcon data-icon="inline-start" aria-hidden />
        Filters
        <TabCount n={active.length} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] gap-2"
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-1 text-xs">
            No filters applied.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((key) => (
              <ListFilterRow
                key={key}
                fieldKey={key}
                fields={[key, ...unused].map((field) => ({
                  value: field,
                  label: def.filters[field].label,
                }))}
                filter={def.filters[key]}
                value={
                  active.includes(key)
                    ? list.query.filters[key]
                    : emptyFilterValue(def.filters[key])
                }
                source={sources[key]}
                shouldFocusValue={focusKey === key}
                onFieldChange={(to) => {
                  handleFieldChange(key, to);
                }}
                onValueChange={(value) => {
                  handleValueChange(key, value);
                }}
                onRemove={() => {
                  handleRemove(key);
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
            disabled={unused.length === 0}
            onClick={handleAdd}
          >
            <PlusIcon data-icon="inline-start" aria-hidden />
            Add filter
          </Button>
          {active.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftKeys([]);
                controls.reset();
              }}
            >
              Clear all
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
