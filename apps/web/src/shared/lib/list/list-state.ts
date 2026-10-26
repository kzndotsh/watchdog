import { LIST_MAX_PAGES, type ListPage } from "@watchdog/schemas/shared";

import { listStatus } from "./list-status";
import type { ListCountValue, ListStatus } from "./list-types";

/** The parts of an infinite query result a list's state is read from. */
export type ListResultView<Item> = {
  readonly pages: readonly ListPage<Item>[];
  /** The previous view's pages stand in while this view's first page loads. */
  readonly isPlaceholderData: boolean;
  /** `listPending` of the query: nothing fetched for it yet. */
  readonly isLoading: boolean;
  readonly isError: boolean;
  /** The view is starting again from page one after a stale cursor. */
  readonly isResetting: boolean;
  readonly hasNextPage: boolean;
};

export type ListState = {
  readonly status: ListStatus;
  readonly isUpdating: boolean;
  /** Whether the error (if any) is the view's to show. */
  readonly isErrorShown: boolean;
  readonly count: ListCountValue;
};

/**
 * The state of one view from its query. While the previous view's rows stand in, the list is
 * updating; when there are none to stand in, it is pending, so a view that is still loading
 * never reads as "No x yet" or "Nothing matches".
 */
export function listStateOf<Item>(
  result: ListResultView<Item>,
  isFiltered: boolean
): ListState {
  const loaded = result.pages.reduce((sum, page) => sum + page.items.length, 0);
  const isStandIn = result.isPlaceholderData;
  const isPending =
    result.isResetting || (isStandIn ? loaded === 0 : result.isLoading);
  const isErrorShown = result.isError && !result.isResetting;
  const status = listStatus({
    isPending,
    isFailed: isErrorShown && (isStandIn || loaded === 0),
    rowCount: loaded,
    isFiltered,
  });
  const lastPage = result.pages.at(-1);
  const isAtCeiling =
    result.pages.length >= LIST_MAX_PAGES &&
    lastPage !== undefined &&
    lastPage.nextCursor !== null;
  return {
    status,
    isUpdating: isStandIn && status !== "pending",
    isErrorShown,
    count: {
      loaded,
      total: result.pages[0]?.total ?? null,
      hasMore: result.hasNextPage || isAtCeiling,
      isAtCeiling,
      isSettled: status !== "pending" && !isStandIn,
    },
  };
}
