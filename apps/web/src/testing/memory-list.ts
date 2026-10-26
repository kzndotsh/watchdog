import type { ListPage } from "@watchdog/schemas/shared";

/** What a list page ServerFn receives: the view's params, the scope ids and the cursor. */
export type ListPageData = Readonly<Record<string, unknown>> & {
  readonly cursor?: string;
};

type MemoryListOptions<T> = {
  /** The server's filter and `q` predicate over one row (the params are the wire input). */
  readonly matches: (row: T, data: ListPageData) => boolean;
  /** The server's order for a `sort` value; rows keep their order without one. */
  readonly compare?: (sort: string | undefined) => (a: T, b: T) => number;
  readonly pageSize?: number;
};

/**
 * A list page ServerFn double for screen tests (`vi.fn(memoryListPage(rows, ...))` behind the
 * mocked `*.functions` module): filters, `q` and sort on the "server", offset cursors, and the
 * total on page one only, as `listPageEffect` returns it. Every call is recorded, so a test reads
 * what a screen asked for.
 */
export function memoryListPage<T>(
  rows: readonly T[],
  { matches, compare, pageSize = 50 }: MemoryListOptions<T>
) {
  return async ({ data }: { data: ListPageData }): Promise<ListPage<T>> => {
    const sort = typeof data.sort === "string" ? data.sort : undefined;
    const matched = rows.filter((row) => matches(row, data));
    const ordered =
      compare === undefined ? matched : [...matched].sort(compare(sort));
    const start = data.cursor === undefined ? 0 : Number(data.cursor);
    const items = ordered.slice(start, start + pageSize);
    const end = start + items.length;
    return {
      items,
      nextCursor: end < ordered.length ? String(end) : null,
      total:
        data.cursor === undefined
          ? { count: ordered.length, isCapped: false }
          : null,
    };
  };
}

/** `q` as the server reads it: a case-insensitive substring of any of `fields`. */
export function matchesQ(
  data: ListPageData,
  fields: readonly (string | null)[]
): boolean {
  const q = typeof data.q === "string" ? data.q.toLowerCase() : "";
  if (q === "") return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(q));
}

/** A `choices` filter as the server reads it: absent or empty is everything. */
export function matchesChoice(value: string, wanted: unknown): boolean {
  return (
    !Array.isArray(wanted) || wanted.length === 0 || wanted.includes(value)
  );
}
