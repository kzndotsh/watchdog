import type { QueryClient } from "@tanstack/react-query";

import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifiersListQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

export type DossierPrefetchTab =
  | "overview"
  | "notes"
  | "claims"
  | "identifiers"
  | "connections"
  | "evidence"
  | "events"
  | "questions"
  | "tasks";

/**
 * Warm dossier Query keys without blocking navigation.
 * Intent preload / loader should `await` only the entity; call this with `void`.
 */
export function warmDossierQueries(
  queryClient: QueryClient,
  caseId: string,
  entityId: string,
  tab: DossierPrefetchTab = "overview"
): void {
  warmEnsureQueryData(queryClient, {
    ...claimsListQuery(caseId, entityId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...identifiersListQuery(caseId, entityId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...edgesListQuery(caseId, entityId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...eventsListQuery(caseId, entityId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...questionsListQuery(caseId, entityId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(caseId, { entityId }),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(caseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId, { hiddenOnly: true }),
    revalidateIfStale: true,
  });

  if (tab === "connections" || tab === "overview") {
    warmEnsureQueryData(queryClient, {
      ...entitiesListQuery(caseId),
      revalidateIfStale: true,
    });
  }
}
