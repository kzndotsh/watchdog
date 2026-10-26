import type { QueryClient } from "@tanstack/react-query";

import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import { evidenceListView } from "@/domains/intake/queries";
import { taskBoardQuery } from "@/domains/tasks/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList } from "@watchdog/schemas/graph";

/**
 * Warm dossier Query keys without blocking navigation.
 * Intent preload / loader should `await` only the entity; call this with `void`.
 */
export function warmDossierQueries(
  queryClient: QueryClient,
  caseId: string,
  entityId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...claimsListQuery(caseId, entityId),
    shouldRevalidateIfStale: true,
  });
  // Tab counts: the first page of each declared list's default view (its `total`).
  identifierListView.warm(
    queryClient,
    { caseId },
    identifierList.queryOf({}, { entityId })
  );
  evidenceListView.warm(
    queryClient,
    { caseId },
    evidenceList.queryOf({}, { entityId })
  );
  warmEnsureQueryData(queryClient, {
    ...edgesListQuery(caseId, entityId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...eventsListQuery(caseId, entityId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...questionsListQuery(caseId, entityId),
    shouldRevalidateIfStale: true,
  });
  // The Tasks tab's count and its open columns: the board for this Entity only (#569), never
  // the Case's whole Task list. Done and Dropped load when the tab opens.
  warmEnsureQueryData(queryClient, {
    ...taskBoardQuery(caseId, { entityId }),
    shouldRevalidateIfStale: true,
  });
  // No Case-wide Evidence or Entity warm (#559): pickers search on the server when opened.
}
