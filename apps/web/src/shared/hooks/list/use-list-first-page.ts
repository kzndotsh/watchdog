import { useInfiniteQuery } from "@tanstack/react-query";

import type { ListView } from "@/shared/lib/list/list-view";
import type { AnyListDef, ListPage, ListQuery } from "@watchdog/schemas/shared";

export type ListFirstPage<Item> = {
  readonly page: ListPage<Item> | undefined;
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly refetch: () => void;
};

/**
 * The first page of one view of a list, read only while `isEnabled`: a popover that shows a few
 * rows and links to the full list (the Entities table's Connections cell). It observes the same
 * Query key as the list's own view, so an open screen costs no second request, and it never
 * loads a second page.
 */
export function useListFirstPage<D extends AnyListDef, Scope, Item>(
  view: ListView<D, Scope, Item>,
  scope: Scope,
  query: ListQuery<NoInfer<D>>,
  isEnabled: boolean
): ListFirstPage<Item> {
  const result = useInfiniteQuery({
    ...view.infinite(scope, query),
    enabled: isEnabled,
  });
  return {
    page: result.data?.pages[0],
    isError: result.isError,
    isPending: result.isPending,
    refetch: () => {
      void result.refetch();
    },
  };
}
