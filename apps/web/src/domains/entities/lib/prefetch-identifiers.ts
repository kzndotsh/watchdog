import type { QueryClient } from "@tanstack/react-query";

import { identifierListView } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { identifierList } from "@watchdog/schemas/graph";
import type { ListSearch } from "@watchdog/schemas/shared";

/** Warm the Identifiers table's first page (the URL's view) and its context, without blocking paint. */
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
  warmEnsureQueryData(queryClient, {
    ...entitiesListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId, { isHiddenOnly: true }),
    shouldRevalidateIfStale: true,
  });
}
