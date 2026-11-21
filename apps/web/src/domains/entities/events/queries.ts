import type { EventRecord } from "@/domains/entities/events/types";
import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { eventList } from "@watchdog/schemas/graph";

/**
 * Events keys are the oRPC procedure keys: `all(caseId)` is `[["events"], { input: { caseId } }]`,
 * every Events query of the Case whatever its procedure, filters or cursor.
 */
export const eventsKeys = {
  all: (caseId: string) => orpc.events.key({ input: { caseId } }),
};

/**
 * The Case's Event list (`eventList`, ADR-0007), a page at a time through `events.list`: the
 * Dossier Events tab is this list with `entityId` fixed. Keys sit under `eventsKeys.all`, so every
 * Entity, Proposal and live Graph invalidation refreshes each open view.
 */
export const eventListView = listView(eventList, {
  procedure: orpc.events.list,
  scopeInput: ({ caseId }: { readonly caseId: string }) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: EventRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});
