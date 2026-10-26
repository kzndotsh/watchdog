import type { QueryClient } from "@tanstack/react-query";

import { claimListView } from "@/domains/entities/claims/queries";
import { edgeListView, graphEgoQuery } from "@/domains/entities/edges/queries";
import { eventListView } from "@/domains/entities/events/queries";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import { questionListView } from "@/domains/entities/questions/queries";
import { evidenceListView } from "@/domains/intake/queries";
import { taskBoardQuery } from "@/domains/tasks/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { evidenceList } from "@watchdog/schemas/evidence";
import {
  claimList,
  edgeList,
  eventList,
  identifierList,
  questionList,
} from "@watchdog/schemas/graph";

/**
 * Warm dossier Query keys without blocking navigation.
 * Intent preload / loader should `await` only the entity; call this with `void`.
 */
export function warmDossierQueries(
  queryClient: QueryClient,
  caseId: string,
  entityId: string
): void {
  const scope = { caseId };
  const fixed = { entityId };
  // Tab counts and the Overview: the first page of each declared list's default view (its
  // `total`), never a whole list (#585).
  claimListView.warm(queryClient, scope, claimList.queryOf({}, fixed));
  identifierListView.warm(
    queryClient,
    scope,
    identifierList.queryOf({}, fixed)
  );
  edgeListView.warm(queryClient, scope, edgeList.queryOf({}, fixed));
  evidenceListView.warm(queryClient, scope, evidenceList.queryOf({}, fixed));
  eventListView.warm(queryClient, scope, eventList.queryOf({}, fixed));
  questionListView.warm(queryClient, scope, questionList.queryOf({}, fixed));
  // The ego graph (Overview and Connections): the server's capped star, one request.
  warmEnsureQueryData(queryClient, {
    ...graphEgoQuery(caseId, entityId),
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
