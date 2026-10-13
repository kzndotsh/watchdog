import type { QueryClient } from "@tanstack/react-query";

import {
  DEFAULT_DOSSIER_TAB,
  type DossierTab,
} from "@/domains/dossier/lib/dossier-tabs";
import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifiersListQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/**
 * Warm dossier Query keys without blocking navigation.
 * Intent preload / loader should `await` only the entity; call this with `void`.
 */
export function warmDossierQueries(
  queryClient: QueryClient,
  caseId: string,
  entityId: string,
  tab: DossierTab = DEFAULT_DOSSIER_TAB
): void {
  warmEnsureQueryData(queryClient, {
    ...claimsListQuery(caseId, entityId),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...identifiersListQuery(caseId, entityId),
    shouldRevalidateIfStale: true,
  });
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
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(caseId, { entityId }),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(caseId),
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

  if (tab === "connections" || tab === "overview") {
    warmEnsureQueryData(queryClient, {
      ...entitiesListQuery(caseId),
      shouldRevalidateIfStale: true,
    });
  }
}
