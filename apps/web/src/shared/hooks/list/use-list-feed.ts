import { useInfiniteQuery } from "@tanstack/react-query";

import { useListViewReset } from "@/shared/hooks/list/use-list-view-reset";
import type { ListView } from "@/shared/lib/list/list-view";
import type { AnyListDef, ListQuery } from "@watchdog/schemas/shared";

/**
 * A feed over a declared list: one view read a page at a time, `data` the loaded items flattened
 * in order, with the query's own `fetchNextPage` for a Load more under it (Recent activity). The
 * feed has no toolbar, URL view or selection, so it skips `useList` but keeps everything the
 * view gives a list: the Query key under the domain, the v2 cursor, the kept previous rows while
 * a new filter loads, and the stale-cursor reset (`useListViewReset`, shared with `useList`): a
 * view that is starting over reports loading, never an error.
 */
export function useListFeed<D extends AnyListDef, Scope, Item>(
  view: ListView<D, Scope, Item>,
  scope: Scope,
  query: ListQuery<NoInfer<D>>
) {
  const result = useInfiniteQuery({
    ...view.infinite(scope, query),
    select: (data) => data.pages.flatMap((page) => page.items),
  });
  const isResetting = useListViewReset(view, scope, query, result);
  return {
    ...result,
    isError: result.isError && !isResetting,
    isLoading: result.isLoading || isResetting,
  };
}
