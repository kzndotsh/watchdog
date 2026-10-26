import { XIcon } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { filterChipLabel } from "@/shared/lib/list/list-copy";
import { activeFilterKeys } from "@/shared/lib/list/list-filters";
import type { AnyFilterSource, ListHandle } from "@/shared/lib/list/list-types";
import { Chip } from "@/shared/ui/chip";
import { Button } from "@/shared/ui/primitives/button";
import type { AnyListDef, FilterKey } from "@watchdog/schemas/shared";

type ListFilterChipsProps<
  D extends AnyListDef,
  Item,
  K extends FilterKey<D>,
> = {
  readonly list: ListHandle<D, Item, K>;
  /** The screen's sources: a `ref` chip shows its record's title, never the id. */
  readonly sources: Readonly<Partial<Record<string, AnyFilterSource>>>;
  /** Where focus goes when the last chip is removed. */
  readonly filtersButtonRef: RefObject<HTMLButtonElement | null>;
};

/** After a removal: the chip to focus, or the Filters button. A new object per removal. */
type FocusRequest = { readonly key: string | null };

/**
 * The row under the toolbar while filters are applied: one chip per active filter ("Kind: URL,
 * File ×", "Hidden ×", "Entity: Acme Ltd ×") and "Clear all". Fixed filters have no chip.
 * Removing a chip moves focus to the next chip, or to the Filters button when it was the last.
 * No entrance animation (DESIGN.md Motion).
 */
export function ListFilterChips<
  D extends AnyListDef,
  Item,
  K extends FilterKey<D>,
>({ list, sources, filtersButtonRef }: ListFilterChipsProps<D, Item, K>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const keys = activeFilterKeys(list);

  // Focus is DOM work: it follows the chip list's re-render after a removal.
  useEffect(() => {
    if (focusRequest === null) return;
    const next =
      focusRequest.key === null
        ? null
        : groupRef.current?.querySelector<HTMLButtonElement>(
            `[data-chip-key="${focusRequest.key}"] button`
          );
    (next ?? filtersButtonRef.current)?.focus();
  }, [focusRequest, filtersButtonRef]);

  if (keys.length === 0) return null;

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label="Active filters"
      data-slot="list-filter-chips"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {keys.map((key, index) => {
        const filter = list.def.filters[key];
        const source = sources[key];
        const title =
          source?.kind === "ref" ? (source.selected?.label ?? null) : null;
        const label = filterChipLabel(filter, list.query.filters[key], title);
        return (
          <Chip key={key} data-chip-key={key} className="gap-1 pr-0.5">
            <span className="max-w-64 truncate">{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${label}`}
              onClick={() => {
                setFocusRequest({ key: keys[index + 1] ?? null });
                list.controls.removeFilter(key);
              }}
            >
              <XIcon />
            </Button>
          </Chip>
        );
      })}
      <Button
        type="button"
        variant="link-muted"
        size="inline"
        className="ml-1 text-xs"
        onClick={() => {
          setFocusRequest({ key: null });
          list.controls.reset();
        }}
      >
        Clear all
      </Button>
    </div>
  );
}
