import type { QueryClient } from "@tanstack/react-query";

import { entityListView } from "@/domains/entities/queries";
import { entityList } from "@watchdog/schemas/graph";
import type { ListSearch } from "@watchdog/schemas/shared";

/**
 * Warm the Entities table's first page (the URL's view), without blocking paint. Nothing else:
 * each row carries its Connections, and the peer pickers search on the server when opened.
 */
export function warmEntitiesQueries(
  queryClient: QueryClient,
  caseId: string,
  search: ListSearch<typeof entityList>
): void {
  entityListView.warm(queryClient, { caseId }, entityList.queryOf(search));
}
