import type { UseQueryResult } from "@tanstack/react-query";

import { errMessage } from "@/lib/utils";

type QueryErrorState = Pick<UseQueryResult, "isError" | "isFetching" | "error">;

/** Surface a query error only after initial fetch settles and refetch finishes. */
export function queryLoadError(
  query: QueryErrorState,
  pending: boolean,
  fallback: string
): string | null {
  if (pending || query.isFetching || !query.isError) return null;
  return errMessage(query.error, fallback);
}

/** Like queryLoadError for parallel queries — first failed query wins. */
export function combinedQueryLoadError(
  queries: QueryErrorState[],
  pending: boolean,
  fallback: string
): string | null {
  if (pending || queries.some((query) => query.isFetching)) return null;
  const failed = queries.find((query) => query.isError);
  if (!failed) return null;
  return errMessage(failed.error, fallback);
}
