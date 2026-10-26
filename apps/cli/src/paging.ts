import {
  ARRAY_MAX,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
} from "@watchdog/schemas/shared";
import type { ListPage, ListTotal, Page } from "@watchdog/schemas/shared";

import { fail } from "./io";

/**
 * Paging flags of every list verb: one page by default (the server's default size, with
 * `nextCursor` in the output), `--limit` for another size, `--cursor` to continue from a
 * previous `nextCursor`, `--all` to read every page.
 */
export const pageArgs = {
  limit: {
    type: "string" as const,
    description: `Page size, 1-${PAGE_LIMIT_MAX} (default ${PAGE_LIMIT_DEFAULT})`,
  },
  cursor: {
    type: "string" as const,
    description: "Continue after this cursor (a previous nextCursor)",
  },
  all: {
    type: "boolean" as const,
    description: "Fetch every page, not only the first",
    default: false,
  },
} as const;

/** What one page request carries to the API. */
export type PageParams = { cursor?: string; limit?: number };

/** A page of a declared list carries `total`; an undeclared list's page does not. */
type ListPageFetcher<T> = (
  page: PageParams
) => Promise<Page<T> & { readonly total?: ListTotal | null }>;

function parseLimit(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const text = (
    typeof raw === "string" || typeof raw === "number" ? `${raw}` : ""
  ).trim();
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isInteger(value) || value < 1 || value > PAGE_LIMIT_MAX) {
    fail("USAGE", `--limit must be a whole number from 1 to ${PAGE_LIMIT_MAX}`);
  }
  return value;
}

function parseCursor(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  return text === "" ? undefined : text;
}

/**
 * The page a list verb prints. Without `--all`, one request (`--limit`, `--cursor`); with it,
 * every page from the cursor on, so the result has no `nextCursor`. `--all` is unbounded on
 * purpose: it is an explicit request for the whole list, read one capped page at a time. The
 * first page's `total` is kept (null when the list has none or the read began at a cursor).
 */
export async function fetchListPage<T>(
  fetchPage: ListPageFetcher<T>,
  args: Record<string, unknown>
): Promise<ListPage<T>> {
  const limit = parseLimit(args.limit);
  const cursor = parseCursor(args.cursor);
  if (args.all !== true) {
    const page = await fetchPage({
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return { ...page, total: page.total ?? null };
  }
  const items: T[] = [];
  let total: ListTotal | null = null;
  let next = cursor;
  let first = true;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
    const page = await fetchPage({
      limit: limit ?? PAGE_LIMIT_MAX,
      ...(next === undefined ? {} : { cursor: next }),
    });
    if (first) total = page.total ?? null;
    first = false;
    items.push(...page.items);
    next = page.nextCursor ?? undefined;
  } while (next !== undefined);
  return { items, nextCursor: null, total };
}

/**
 * A by-id read for any number of ids: the ids go in requests of at most `ARRAY_MAX` (a
 * `getMany` refuses more) and the rows are merged in order.
 */
export async function getManyChunked<T>(
  ids: readonly string[],
  fetchChunk: (chunk: string[]) => Promise<readonly T[]>
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += ARRAY_MAX) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one bounded request at a time
    rows.push(...(await fetchChunk(ids.slice(start, start + ARRAY_MAX))));
  }
  return rows;
}
