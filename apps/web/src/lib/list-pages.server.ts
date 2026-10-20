import "@tanstack/react-start/server-only";
import { PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";
import type { Page } from "@watchdog/schemas/shared";

/**
 * Every item of a paged API list, page after page (the largest page each time), for the server
 * functions of screens that still need the whole list: the graph, the dossier tabs, the kanban
 * board. A table that can grow without bound reads a page at a time instead (an infinite query
 * over a paged server function).
 */
export async function listAllPages<T>(
  fetchPage: (page: { cursor?: string; limit: number }) => Promise<Page<T>>
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
