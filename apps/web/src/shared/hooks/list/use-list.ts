import {
  hashKey,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo } from "react";

import { couldnt, errMessage } from "@/lib/utils";
import { useListSearchDraft } from "@/shared/hooks/list/use-list-search-draft";
import { useListSelection } from "@/shared/hooks/list/use-list-selection";
import { listPending } from "@/shared/lib/list-pending";
import { listControlsOf } from "@/shared/lib/list/list-controls";
import { listStateOf } from "@/shared/lib/list/list-state";
import { isListViewReset } from "@/shared/lib/list/list-status";
import type { ListHandle, UseListArgs } from "@/shared/lib/list/list-types";
import type { ListView } from "@/shared/lib/list/list-view";
import {
  opsOf,
  type AnyListDef,
  type FilterKey,
  type ListQuery,
} from "@watchdog/schemas/shared";

/**
 * THE hook a list screen calls. It owns what used to be per screen:
 *
 *   URL search ─def.queryOf─► query ─view.infinite─► useInfiniteQuery ─► rows, count, status
 *        ▲                                                                   │
 *        └──── onSearchChange(def.toSearch(next)) ◄── controls ◄─────────────┘ (toolbar, chips)
 *
 * - The URL is the source of truth for `q`, sort and filters. The hook holds only the search
 *   draft (`useListSearchDraft`) and the selection; presentation lives in `useListDisplay`.
 * - Fixed filters are in the query and key, never in the URL, never a chip, untouched by Clear,
 *   not offered by the Filters popover and not counted by `isFiltered`.
 * - A new view shows the previous view's rows (`isUpdating`), or is pending when there are
 *   none; its selection starts empty (`listStateOf`, `useListSelection`).
 * - At `LIST_MAX_PAGES` pages there is no next page (`count.isAtCeiling`).
 * - A `cursor_stale` error resets the view to page one once (`listView` marks it); any other
 *   error is the error state, or an alert above kept rows.
 * - A moving sort (`moving: true`) keeps the first occurrence of an id across pages.
 * - A refresh (SSE, a mutation) is throttled per view by `softInvalidate`.
 */
export function useList<
  D extends AnyListDef,
  Scope,
  Item,
  K extends FilterKey<D> = never,
>(
  view: ListView<D, Scope, Item>,
  args: UseListArgs<D, Scope, K>
): ListHandle<D, Item, K> {
  const { def } = view;
  const ops = opsOf(def);
  const { fixed, onSearchChange } = args;
  const query = ops.queryOf<K>(args.search, fixed);
  const viewKey = ops.keyOf(query);
  const isFiltered = ops.isFiltered(query, fixed);

  const write = (next: ListQuery<D>) => {
    onSearchChange(ops.toSearch<K>(next, fixed));
  };
  const draft = useListSearchDraft(query.q, (q) => {
    write({ ...query, q });
  });

  const result = useInfiniteQuery(view.infinite(args.scope, query));
  const { data } = result;
  const pages = useMemo(() => data?.pages ?? [], [data]);
  // A moving sort (`activity`) can show a row on two pages: it dropped past the cursor and came
  // back. The first occurrence stays; any other sort has unique ids, so nothing is dropped.
  const isMoving = def.sorts[ops.sortParts(query.sort).key]?.moving === true;
  const { getId } = view;
  const rows = useMemo(() => {
    const all = pages.flatMap((page) => page.items);
    if (!isMoving) return all;
    const seen = new Set<string>();
    return all.filter((item) => {
      const id = getId(item);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [pages, isMoving, getId]);
  const isResetting = result.isError && isListViewReset(result.error);

  // The query marked a stale cursor: starting the view again is a cache write (external).
  const queryClient = useQueryClient();
  const resetView = useEffectEvent(() => {
    void queryClient.resetQueries({
      queryKey: view.key(args.scope, query),
      exact: true,
    });
  });
  // Per-view state (the reset, the selection) is keyed by scope and view: another Case with the
  // same filters is another view.
  const stateKey = hashKey(view.key(args.scope, query));
  useEffect(() => {
    if (isResetting) resetView();
  }, [isResetting, stateKey]);

  const state = listStateOf(
    {
      pages,
      isPlaceholderData: result.isPlaceholderData,
      isLoading: listPending(result),
      isError: result.isError,
      isResetting,
      hasNextPage: result.hasNextPage,
    },
    isFiltered
  );
  const errorCopy = args.errorCopy ?? couldnt("load", def.noun.many);
  const selection = useListSelection(stateKey);

  return {
    def,
    fixed,
    query,
    viewKey,
    isFiltered,
    rows,
    getId: view.getId,
    status: state.status,
    isUpdating: state.isUpdating,
    error: state.isErrorShown ? errMessage(result.error, errorCopy) : null,
    retry: () => {
      void result.refetch();
    },
    count: state.count,
    more: {
      hasNextPage: result.hasNextPage,
      isFetchingNextPage: result.isFetchingNextPage,
      fetchNextPage: async () => result.fetchNextPage(),
    },
    controls: listControlsOf(def, query, fixed, draft, write),
    selection,
  };
}
