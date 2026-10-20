import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { useEffect } from "react";

/** The part of an infinite query result a list needs to ask for another page. */
export type PagedQuery = Pick<
  UseInfiniteQueryResult,
  "fetchNextPage" | "hasNextPage" | "isError" | "isFetchingNextPage"
>;

/**
 * A paged list is a window over the server's order: filters and a URL selection look only at
 * the rows loaded so far. While `isSatisfied` is false (the selected row is not loaded yet, or
 * the filtered view is empty) and the server has more pages, ask for the next one, so the
 * screen settles on a true answer instead of "nothing here" for a row on a later page. It
 * stops at the last page, on an error, and while a page is on its way.
 */
export function useFetchMoreUntil(
  query: PagedQuery,
  isSatisfied: boolean
): void {
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = query;
  useEffect(() => {
    if (isSatisfied || !hasNextPage || isFetchingNextPage || isError) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage, isSatisfied]);
}
