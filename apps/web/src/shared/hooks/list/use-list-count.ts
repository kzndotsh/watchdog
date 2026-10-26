import { useInfiniteQuery } from "@tanstack/react-query";

import { listPending } from "@/shared/lib/list-pending";
import { listStateOf } from "@/shared/lib/list/list-state";
import type { ListCountValue } from "@/shared/lib/list/list-types";
import type { ListView } from "@/shared/lib/list/list-view";
import type { AnyListDef, ListQuery } from "@watchdog/schemas/shared";

/**
 * The count of one view of a list from its first page's `total`: a tab's count pill
 * (`<ListCount variant="compact" isLive={false} />`) for the tab's default view,
 * `def.queryOf({}, fixed)`. It observes the same Query key as the tab's own unfiltered view, so
 * an open tab costs no second request, and it never reads more than the first page.
 */
export function useListCount<D extends AnyListDef, Scope, Item>(
  view: ListView<D, Scope, Item>,
  scope: Scope,
  query: ListQuery<NoInfer<D>>
): ListCountValue {
  const result = useInfiniteQuery(view.infinite(scope, query));
  return listStateOf(
    {
      pages: result.data?.pages ?? [],
      isPlaceholderData: result.isPlaceholderData,
      isLoading: listPending(result),
      isError: result.isError,
      isResetting: false,
      hasNextPage: result.hasNextPage,
    },
    false
  ).count;
}
