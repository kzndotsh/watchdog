import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { isListViewReset } from "@/shared/lib/list/list-status";
import type { ListView } from "@/shared/lib/list/list-view";
import type { AnyListDef, ListQuery } from "@watchdog/schemas/shared";

/**
 * The one stale-cursor handling of a list view. The view's query marks a stale cursor with a
 * `ListViewResetError` (once per view); this starts the view again from page one, a cache write
 * that happens in an effect. Returns whether the view is resetting, so a screen shows it as
 * loading rather than as an error. `key` changes with the view (scope and filters), so another
 * view's reset never carries over.
 */
export function useListViewReset<D extends AnyListDef, Scope, Item>(
  view: ListView<D, Scope, Item>,
  scope: Scope,
  query: ListQuery<NoInfer<D>>,
  result: { readonly isError: boolean; readonly error: unknown }
): boolean {
  const isResetting = result.isError && isListViewReset(result.error);
  const queryClient = useQueryClient();
  const queryKey = view.key(scope, query);
  const resetView = useEffectEvent(() => {
    void queryClient.resetQueries({ queryKey, exact: true });
  });
  const stateKey = JSON.stringify(queryKey);
  useEffect(() => {
    if (isResetting) resetView();
  }, [isResetting, stateKey]);
  return isResetting;
}
