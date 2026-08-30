import type { UseQueryResult } from "@tanstack/react-query";

/**
 * True when a list query should show a skeleton — not on background refetch,
 * not on error, not when disabled.
 *
 * Gating on `isPending` alone flashes skeleton → empty → data because empty
 * is not pending once the fetch settles with no rows.
 */
export function listPending<T>(
  query: Pick<UseQueryResult<T>, "isFetched" | "isError" | "isLoading">,
  options?: { enabled?: boolean }
): boolean {
  if (options?.enabled === false || query.isError) return false;
  return query.isLoading || !query.isFetched;
}
