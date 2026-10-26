import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";

import { couldnt, errMessage } from "@/lib/utils";
import { useListSearchDraft } from "@/shared/hooks/list/use-list-search-draft";
import { useListSelection } from "@/shared/hooks/list/use-list-selection";
import { listPending } from "@/shared/lib/list-pending";
import { isQueryValue } from "@/shared/lib/list/list-guards";
import { isStaleCursorError, listStatus } from "@/shared/lib/list/list-status";
import type { ListHandle, UseListArgs } from "@/shared/lib/list/list-types";
import type { ListView } from "@/shared/lib/list/list-view";
import {
  LIST_MAX_PAGES,
  emptyFilterValue,
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
 * - A new view is a new cache entry that shows the previous view's rows (`isUpdating`), never a
 *   skeleton; its selection starts empty.
 * - At `LIST_MAX_PAGES` pages there is no next page (`count.isAtCeiling`).
 * - A `cursor_stale` error resets the view to its first page, at most once per view; any other
 *   error is the error state (or an alert above kept rows).
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
  const queryClient = useQueryClient();
  const pages = result.data?.pages ?? [];
  const rows = pages.flatMap((page) => page.items);
  const isStale = result.isError && isStaleCursorError(result.error);

  // A cursor issued for another view (a deploy changed the fingerprint, a refresh walk crossed
  // a filter change): drop the pages and start again from page one, once per view.
  const [resetViews, setResetViews] = useState<ReadonlySet<string>>(new Set());
  const shouldReset = isStale && !resetViews.has(viewKey);
  const resetView = useEffectEvent(() => {
    setResetViews(new Set([...resetViews, viewKey]));
    void queryClient.resetQueries({
      queryKey: view.key(args.scope, query),
      exact: true,
    });
  });
  useEffect(() => {
    if (shouldReset) resetView();
  }, [shouldReset]);

  const isPending =
    !result.isPlaceholderData && (shouldReset || listPending(result));
  const hasOwnRows = !result.isPlaceholderData && rows.length > 0;
  const isFailed = result.isError && !shouldReset && !hasOwnRows;
  const errorCopy = args.errorCopy ?? couldnt("load", def.noun.many);
  const error =
    result.isError && !shouldReset ? errMessage(result.error, errorCopy) : null;
  const status = listStatus({
    isPending,
    isFailed,
    rowCount: rows.length,
    isFiltered,
  });
  const lastPage = pages.at(-1);
  const isAtCeiling =
    pages.length >= LIST_MAX_PAGES &&
    lastPage !== undefined &&
    lastPage.nextCursor !== null;

  const selection = useListSelection(viewKey);

  return {
    def,
    fixed,
    query,
    viewKey,
    isFiltered,
    rows,
    getId: view.getId,
    status,
    isUpdating: result.isPlaceholderData,
    error,
    retry: () => {
      void result.refetch();
    },
    count: {
      loaded: rows.length,
      total: pages[0]?.total ?? null,
      hasMore: result.hasNextPage || isAtCeiling,
      isAtCeiling,
      isSettled: status !== "pending" && !result.isPlaceholderData,
    },
    more: {
      hasNextPage: result.hasNextPage,
      isFetchingNextPage: result.isFetchingNextPage,
      fetchNextPage: async () => result.fetchNextPage(),
    },
    controls: {
      draftQ: draft.text,
      setDraftQ: draft.setText,
      setSearchFocused: draft.setFocused,
      clearSearch: draft.clear,
      availableFilters: ops.availableFilters(fixed),
      setFilter: (key, value) => {
        write(ops.withFilter(query, key, value, fixed));
      },
      removeFilter: (key) => {
        const empty = emptyFilterValue(def.filters[key]);
        if (isQueryValue(def, key, empty)) {
          write(ops.withFilter(query, key, empty, fixed));
        }
      },
      setSort: (sort) => {
        write({ ...query, sort });
      },
      reset: () => {
        draft.discard();
        write(ops.cleared(query, fixed));
      },
    },
    selection,
  };
}
