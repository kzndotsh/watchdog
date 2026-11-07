import { QueryClient, type Query, type QueryKey } from "@tanstack/react-query";

/**
 * What a query option's `placeholderData` answers for `previous` data while the next query loads,
 * given the key of the previous query it would keep (`previousQueryKey`; `undefined`: no
 * placeholder). Runs the real option over a real Query, so a test asserts the keep-previous-data
 * rule (same Case only) without a fake Query object. The QueryClient is cleared before return.
 */
export function placeholderFor<TData>(
  options: { placeholderData?: unknown },
  previous: TData,
  previousQueryKey: QueryKey
): TData | undefined {
  const { placeholderData } = options;
  if (typeof placeholderData !== "function") {
    throw new TypeError("The query option has no placeholderData function");
  }
  const client = new QueryClient();
  try {
    const query = client
      .getQueryCache()
      .build<TData, Error, TData>(client, { queryKey: previousQueryKey });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the option's own PlaceholderDataFunction for this query
    const keep = placeholderData as (
      previous: TData,
      query: Query<TData, Error, TData>
    ) => TData | undefined;
    return keep(previous, query);
  } finally {
    client.clear();
  }
}
