import type { ReactTable, RowData } from "@tanstack/react-table";
import { useRef, type ReactNode } from "react";

import type { ListDisplay } from "@/shared/hooks/list/use-list-display";
import type {
  AnyFilterSource,
  ListFilterSources,
  ListHandle,
  SourcedFilterKey,
} from "@/shared/lib/list/list-types";
import type { ServerTableFeatures } from "@/shared/ui/data-table/server-table-features";
import { ListDisplayButton } from "@/shared/ui/list/list-display-button";
import { ListFilterChips } from "@/shared/ui/list/list-filter-chips";
import { ListFiltersButton } from "@/shared/ui/list/list-filters-button";
import { ListSearch } from "@/shared/ui/list/list-search";
import type { AnyListDef, FilterKey } from "@watchdog/schemas/shared";

/** A screen's runtime options: required exactly when the list has an unfixed `ref` or `tags` filter. */
type SourcesProp<D extends AnyListDef, K extends FilterKey<D>> = [
  Exclude<SourcedFilterKey<D>, K>,
] extends [never]
  ? { readonly sources?: undefined }
  : { readonly sources: ListFilterSources<D, K> };

type ListToolbarProps<
  D extends AnyListDef,
  Item extends RowData,
  K extends FilterKey<D> = never,
> = {
  readonly list: ListHandle<D, Item, K>;
  /** Presentation state from `useListDisplay`. */
  readonly display: ListDisplay;
  /** A table's columns for the Display options Columns checklist. */
  readonly table?: ReactTable<ServerTableFeatures, Item>;
  /** Right-aligned: the screen's own buttons ("Add identifier"). Never filters. */
  readonly actions?: ReactNode;
} & SourcesProp<D, K>;

const NO_SOURCES: Readonly<Partial<Record<string, AnyFilterSource>>> = {};

/**
 * The one list toolbar (modelled on Cloudflare's DNS records table). One row, left to right:
 *
 *   [ Search identifiers by value, platform or notes…   / ] [ Filters 2 ] [ Display options ]   [ actions ]
 *     Type: Email, Phone ×   Entity: Acme Ltd ×   Clear all          ← only while filtered
 *
 * Everything comes from `list.def`; the screen passes only the runtime options of its `ref` and
 * `tags` filters, its view toggles (through `display`) and its own actions. Fixed filters are
 * never offered and never chips. The row wraps on a narrow screen (the search keeps a full row).
 */
export function ListToolbar<
  D extends AnyListDef,
  Item extends RowData,
  K extends FilterKey<D> = never,
>(props: ListToolbarProps<D, Item, K>) {
  const { list, display, table, actions } = props;
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const sourcesProp:
    | Readonly<Partial<Record<string, AnyFilterSource>>>
    | undefined = props.sources;
  const sources = sourcesProp ?? NO_SOURCES;
  const { def } = list;
  const hasFilters = list.controls.availableFilters.length > 0;

  return (
    <div data-slot="list-toolbar" className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-2">
        {def.search === undefined ? null : (
          <ListSearch
            controls={list.controls}
            placeholder={`Search ${def.noun.many} by ${def.search.hint}…`}
            aria-label={`Search ${def.noun.many}`}
          />
        )}
        {hasFilters ? (
          <ListFiltersButton
            list={list}
            sources={sources}
            triggerRef={filtersButtonRef}
          />
        ) : null}
        <ListDisplayButton list={list} display={display} table={table} />
        {actions ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <ListFilterChips
        list={list}
        sources={sources}
        filtersButtonRef={filtersButtonRef}
      />
    </div>
  );
}
