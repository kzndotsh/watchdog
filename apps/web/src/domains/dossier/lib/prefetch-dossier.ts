import type { QueryClient } from "@tanstack/react-query";

import { needsEvidencePicker } from "@/domains/dossier/hooks/use-dossier-shell-queries";
import {
  DEFAULT_DOSSIER_TAB,
  type DossierTab,
} from "@/domains/dossier/lib/dossier-tabs";
import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import { evidenceListQuery, evidenceListView } from "@/domains/intake/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
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
  entityId: string,
  tab: DossierTab = DEFAULT_DOSSIER_TAB
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
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(caseId, { entityId }),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...tasksListQuery(caseId),
    shouldRevalidateIfStale: true,
  });
  if (needsEvidencePicker(tab)) {
    warmEnsureQueryData(queryClient, {
      ...evidenceListQuery(caseId),
      shouldRevalidateIfStale: true,
    });
    warmEnsureQueryData(queryClient, {
      ...evidenceListQuery(caseId, { isHiddenOnly: true }),
      shouldRevalidateIfStale: true,
    });
  }

  if (tab === "connections" || tab === "overview") {
    warmEnsureQueryData(queryClient, {
      ...entitiesListQuery(caseId),
      shouldRevalidateIfStale: true,
    });
  }
}
