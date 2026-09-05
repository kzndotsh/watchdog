import type {
  DefaultError,
  EnsureQueryDataOptions,
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";

function isCancelledError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "CancelledError" || error.message === "CancelledError")
  );
}

async function swallowCancelled(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error: unknown) {
    // Fire-and-forget warm: CancelledError is expected on SSR/HMR teardown.
    if (!isCancelledError(error)) {
      /* ignore */
    }
  }
}

/** Fire-and-forget warm fetch — swallows SSR/HMR teardown cancellations. */
export function warmEnsureQueryData<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryClient: QueryClient,
  options: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>
): void {
  void swallowCancelled(queryClient.ensureQueryData(options));
}

/** Fire-and-forget warm prefetch — swallows SSR/HMR teardown cancellations. */
export function warmPrefetchQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryClient: QueryClient,
  options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): void {
  void swallowCancelled(queryClient.prefetchQuery(options));
}
