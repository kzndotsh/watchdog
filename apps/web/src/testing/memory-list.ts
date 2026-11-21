import type { ListPage } from "@watchdog/domain/schemas/shared";

/** What a list procedure receives: the view's params, the scope ids and the cursor. */
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
 * A list procedure double for screen tests over in-memory rows
 * (`procedureDouble("claims.list").mockImplementation(memoryListProcedure(rows, ...))`, from
 * `@/testing/orpc-client`): filters, `q` and sort on the "server", offset cursors, and the total
 * on page one only, as `listPageEffect` returns it.
 *
 * @canonical `memoryListProcedure`, `lastProcedureInput`: A list procedure double for screen tests (filters, `q`, sort, cursors, total on page one) and what the screen asked it for last
 */
export function memoryListProcedure<T>(
  rows: readonly T[],
  { matches, compare, pageSize = 50 }: MemoryListOptions<T>
) {
  return async (data: ListPageData): Promise<ListPage<T>> => {
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

/** The input a list procedure double received last: what the screen asked the server for. */
export function lastProcedureInput(fn: {
  readonly mock: { readonly lastCall?: readonly unknown[] };
}): Record<string, unknown> {
  const input: unknown = fn.mock.lastCall?.[0];
  if (typeof input !== "object" || input === null) {
    throw new Error("no list request yet");
  }
  return { ...input };
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
