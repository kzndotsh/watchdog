import { useState } from "react";

import { useListSearchDraft } from "@/shared/hooks/list/use-list-search-draft";
import { useListSelection } from "@/shared/hooks/list/use-list-selection";
import { listControlsOf } from "@/shared/lib/list/list-controls";
import { listStatus } from "@/shared/lib/list/list-status";
import type { ListHandle, UseListArgs } from "@/shared/lib/list/list-types";
import {
  opsOf,
  type AnyListDef,
  type ListQuery,
  type UnfixedSearch,
  type UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

/**
 * A bounded list's view state held in the component, for a screen that keeps it in `useState`
 * rather than the URL (the Cap and Playbook run forms): the same patch rule as the URL's writer
 * (`usePatchSearch`), a key patched to `undefined` is removed from the view.
 */
export function useLocalListSearch<D extends AnyListDef>(
  initial: UnfixedSearch<D, never>
): readonly [
  UnfixedSearch<D, never>,
  (patch: UnfixedSearchPatch<D, never>) => void,
] {
  const [search, setSearch] = useState(initial);
  const patchSearch = (patch: UnfixedSearchPatch<D, never>) => {
    setSearch((prev) => {
      const next = { ...prev, ...patch };
      for (const key of Object.keys(patch)) {
        if (Reflect.get(patch, key) === undefined)
          Reflect.deleteProperty(next, key);
      }
      return next;
    });
  };
  return [search, patchSearch];
}

export type BoundedListArgs<D extends AnyListDef, Item> = Pick<
  UseListArgs<D, undefined>,
  "search" | "onSearchChange"
> & {
  /** The rows that pass the query: the screen filters its own, already loaded, data. */
  readonly rows: readonly Item[];
  readonly getId: (item: Item) => string;
  /** Every row before filtering: 0 is a blank slate, never "nothing matches". */
  readonly totalRows: number;
  /** The data has not arrived yet. */
  readonly isPending?: boolean;
  /** The load failed; shown in place of rows when there are none. */
  readonly error?: string | null;
  readonly retry?: () => void;
};

const NO_RETRY = () => {
  // a bounded list's data is already in hand: nothing to retry
};

/**
 * The bounded sibling of `useList` (#573): the screen's data is a registry-sized read it already
 * holds (the Library, the Cap and Playbook catalogs), so it keeps its own data source and filters
 * the rows itself from `list.query`. What it shares with a server list is everything the user
 * touches: the declaration, the canonical query, the controls and the status, so the standard
 * toolbar, Filters and Display options parts, the chips and the empty states run unchanged on it.
 * There is no paging: every row is loaded, `count.total` is exact and `more` has no next page.
 *
 *   search ─def.queryOf─► query ─(the screen filters its rows)─► rows ─► useBoundedList
 *      ▲                                                                      │
 *      └──── onSearchChange(def.toSearch(next)) ◄── controls ◄───────────────┘
 */
export function useBoundedList<D extends AnyListDef, Item>(
  def: D,
  args: BoundedListArgs<D, Item>
): ListHandle<D, Item> {
  const ops = opsOf(def);
  const { onSearchChange, rows, totalRows } = args;
  const query = ops.queryOf(args.search);
  const viewKey = ops.keyOf(query);
  const isFiltered = ops.isFiltered(query);

  const write = (next: ListQuery<D>) => {
    onSearchChange(ops.toSearch(next));
  };
  const draft = useListSearchDraft(query.q, (q) => {
    write({ ...query, q });
  });
  const error = args.error ?? null;
  const isPending = args.isPending === true;

  return {
    def,
    fixed: undefined,
    query,
    viewKey,
    isFiltered,
    rows,
    getId: args.getId,
    status: listStatus({
      isPending,
      isFailed: error !== null,
      rowCount: rows.length,
      // Nothing loaded at all is a blank slate, however the view is filtered.
      isFiltered: isFiltered && totalRows > 0,
    }),
    isUpdating: false,
    error,
    retry: args.retry ?? NO_RETRY,
    count: {
      loaded: rows.length,
      total: { count: rows.length, isCapped: false },
      hasMore: false,
      isAtCeiling: false,
      isSettled: !isPending,
    },
    more: {
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: async () => null,
    },
    // oxlint-disable-next-line unicorn/no-useless-undefined -- `fixed` is a positional parameter: a bounded list fixes no filter
    controls: listControlsOf(def, query, undefined, draft, write),
    selection: useListSelection(viewKey),
  };
}
