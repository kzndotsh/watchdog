import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";
import type { Page } from "@watchdog/schemas/shared";

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

type PageFetcher<T> = (page: PageParams) => Promise<Page<T>>;

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

/** Every item of a list, page after page: for lookups that need the whole list, never for output. */
export async function fetchAllItems<T>(
  fetchPage: PageFetcher<T>
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
    const page = await fetchPage({
      limit: PAGE_LIMIT_MAX,
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}

/**
 * The page a list verb prints. Without `--all`, one request (`--limit`, `--cursor`); with it,
 * every page from the cursor on, so the result has no `nextCursor`.
 */
export async function fetchListPage<T>(
  fetchPage: PageFetcher<T>,
  args: Record<string, unknown>
): Promise<Page<T>> {
  const limit = parseLimit(args.limit);
  const cursor = parseCursor(args.cursor);
  if (args.all !== true) {
    return fetchPage({
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    });
  }
  const items: T[] = [];
  let next = cursor;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
    const page = await fetchPage({
      limit: limit ?? PAGE_LIMIT_MAX,
      ...(next === undefined ? {} : { cursor: next }),
    });
    items.push(...page.items);
    next = page.nextCursor ?? undefined;
  } while (next !== undefined);
  return { items, nextCursor: null };
}
