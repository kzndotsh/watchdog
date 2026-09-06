import type {
  DefaultError,
  QueryClient,
  QueryExecuteOptions,
  QueryKey,
} from "@tanstack/react-query";

type AppWarmEnsureOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never,
> = QueryExecuteOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryData,
  TQueryKey,
  TPageParam
> & {
  revalidateIfStale?: boolean;
};

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

async function runWarmEnsureQueryData<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never,
>(
  queryClient: QueryClient,
  options: AppWarmEnsureOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey,
    TPageParam
  >
): Promise<void> {
  const { revalidateIfStale, ...queryOptions } = options;

  if (!revalidateIfStale) {
    await queryClient.query(queryOptions);
    return;
  }

  const defaultedOptions = queryClient.defaultQueryOptions(queryOptions);
  const cachedQuery = queryClient
    .getQueryCache()
    .build(queryClient, defaultedOptions);

  if (cachedQuery.state.data === undefined) {
    await queryClient.query(queryOptions);
    return;
  }

  const staleTime =
    typeof defaultedOptions.staleTime === "function"
      ? defaultedOptions.staleTime(cachedQuery)
      : defaultedOptions.staleTime;

  if (cachedQuery.isStaleByTime(staleTime)) {
    await queryClient.query(queryOptions);
  }
}

/** Loader/session ensure — TanStack Query v5.102+ `query()` with static staleTime. */
export async function ensureAppQueryData<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never,
>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey,
    TPageParam
  >
): Promise<TData> {
  return queryClient.query({ ...options, staleTime: "static" });
}

/** Fire-and-forget warm fetch — swallows SSR/HMR teardown cancellations. */
export function warmEnsureQueryData<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never,
>(
  queryClient: QueryClient,
  options: AppWarmEnsureOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey,
    TPageParam
  >
): void {
  void swallowCancelled(runWarmEnsureQueryData(queryClient, options));
}

/** Fire-and-forget warm prefetch — swallows SSR/HMR teardown cancellations. */
export function warmPrefetchQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never,
>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey,
    TPageParam
  >
): void {
  void swallowCancelled(queryClient.query(options));
}
