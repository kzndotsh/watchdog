import type { QueryClient } from "@tanstack/react-query";

import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifiersListQuery } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { warmPrefetchQuery } from "@/shared/lib/warm-query";

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
  // Tab counts + overview share these — prefetch all lightly.
  warmPrefetchQuery(queryClient, claimsListQuery(caseId, entityId));
  warmPrefetchQuery(queryClient, identifiersListQuery(caseId, entityId));
  warmPrefetchQuery(queryClient, edgesListQuery(caseId, entityId));
  warmPrefetchQuery(queryClient, eventsListQuery(caseId, entityId));
  warmPrefetchQuery(queryClient, questionsListQuery(caseId, entityId));
  warmPrefetchQuery(queryClient, tasksListQuery(caseId, { entityId }));
  warmPrefetchQuery(queryClient, evidenceListQuery(caseId));

  if (tab === "connections" || tab === "overview") {
    warmPrefetchQuery(queryClient, entitiesListQuery(caseId));
  }
}
