import { listEventsPageFn } from "@/domains/entities/events/events.functions";
import type { EventRecord } from "@/domains/entities/events/types";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { eventList } from "@watchdog/schemas/graph";

export const eventsKeys = {
  prefix: (caseId: string) => ["events", caseId] as const,
};

/**
 * The Case's Event list (`eventList`, ADR-0007), a page at a time: the Dossier Events tab is this
 * list with `entityId` fixed. Keys sit under `eventsKeys.prefix`, so every Entity, Proposal and live
 * Graph invalidation refreshes each open view.
 */
export const eventListView = listView(eventList, {
  domain: "events",
  scopeKey: ({ caseId }: { readonly caseId: string }) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listEventsPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: EventRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});
