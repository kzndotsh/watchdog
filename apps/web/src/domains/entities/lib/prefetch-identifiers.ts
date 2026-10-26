import type { QueryClient } from "@tanstack/react-query";

import { identifierListView } from "@/domains/entities/identifiers/queries";
import { identifierList } from "@watchdog/schemas/graph";
import type { ListSearch } from "@watchdog/schemas/shared";

/**
 * Warm the Identifiers table's first page (the URL's view), without blocking paint. Nothing
 * else: its pickers search on the server when opened, and linked titles follow the page.
 */
export function warmIdentifiersQueries(
  queryClient: QueryClient,
  caseId: string,
  search: ListSearch<typeof identifierList>
): void {
  identifierListView.warm(
    queryClient,
    { caseId },
    identifierList.queryOf(search)
  );
}
