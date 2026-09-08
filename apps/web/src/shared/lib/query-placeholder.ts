import {
  keepPreviousData,
  type PlaceholderDataFunction,
} from "@tanstack/react-query";

function isPlainObject(value: object): value is Record<string, unknown> {
  return !Array.isArray(value);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (!isPlainObject(value)) {
    return JSON.stringify(value);
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

/** Keep stale rows only while the active query stays in the same scope. */
export function placeholderDataForScope<TData>(
  matches: (
    previousQuery: { queryKey: readonly unknown[] } | undefined
  ) => boolean
): PlaceholderDataFunction<TData> {
  return (previousData, previousQuery) =>
    matches(previousQuery) ? keepPreviousData(previousData) : undefined;
}

/** Keep stale rows only while the full query key is unchanged. */
export function placeholderDataForQueryKey<TData>(
  queryKey: readonly unknown[]
): PlaceholderDataFunction<TData> {
  const serialized = stableSerialize(queryKey);
  return placeholderDataForScope(
    (previousQuery) => stableSerialize(previousQuery?.queryKey) === serialized
  );
}

/**
 * Read placeholder state from query/suspense-query results.
 * Suspense result types omit `isPlaceholderData` even when `placeholderData` is set.
 */
export function isQueryPlaceholderData(result: object): boolean {
  if (!("isPlaceholderData" in result)) return false;
  return Reflect.get(result, "isPlaceholderData") === true;
}

/** True when any query in the batch is showing placeholder data. */
export function anyQueryPlaceholderData(results: readonly object[]): boolean {
  for (const result of results) {
    if (isQueryPlaceholderData(result)) return true;
  }
  return false;
}
