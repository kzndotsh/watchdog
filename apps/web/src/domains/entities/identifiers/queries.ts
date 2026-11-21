import { queryOptions } from "@tanstack/react-query";

import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { identifierList } from "@watchdog/schemas/graph";
import { opsOf, type ListQuery } from "@watchdog/schemas/shared";

/**
 * Identifiers keys are the oRPC procedure keys: `all(caseId)` is
 * `[["identifiers"], { input: { caseId } }]`, every Identifiers query of the Case whatever its
 * procedure (the list views, the type counts), filters or cursor.
 */
export const identifiersKeys = {
  all: (caseId: string) => orpc.identifiers.key({ input: { caseId } }),
};

/** The scope of the Case's Identifier list: one per Case. */
export type IdentifierListScope = { readonly caseId: string };

/**
 * The Case's Identifier list (`identifierList`, ADR-0007), a page at a time through
 * `identifiers.list`: the Identifiers table, and the Dossier tab with `entityId` fixed. Keys sit
 * under `identifiersKeys.all`, so every Entity and Proposal invalidation refreshes each open view.
 */
export const identifierListView = listView(identifierList, {
  procedure: orpc.identifiers.list,
  scopeInput: ({ caseId }: IdentifierListScope) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: CaseIdentifierRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/** The `entityId` of a type-counts key's input (`[path, { input }]`); null when it has none. */
function entityIdOfKey(queryKey: readonly unknown[]): unknown {
  const options: unknown = queryKey[1];
  if (typeof options !== "object" || options === null) return undefined;
  const input: unknown = Reflect.get(options, "input");
  if (typeof input !== "object" || input === null) return undefined;
  return Reflect.get(input, "entityId") ?? null;
}

/**
 * The Identifiers a view of the list matches, per type (`identifiers.typeCounts`): the group
 * headers of an Entity's Identifiers grouped by type. Under `identifiersKeys.all`, so it refreshes
 * with the list. A new filter or search keeps the same Entity's previous counts until its own
 * arrive; another Entity never shows this one's (its groups would open by the wrong counts).
 */
export const identifierTypeCountsQuery = (
  caseId: string,
  query: ListQuery<typeof identifierList>
) => {
  const input = {
    ...opsOf(identifierList).toSearch(query),
    caseId: scopeCaseId(caseId),
  };
  const entityId = query.filters.entityId ?? null;
  return queryOptions({
    queryKey: orpc.identifiers.typeCounts.queryKey({ input }),
    queryFn: async () => orpc.identifiers.typeCounts.call(input),
    enabled: scopeCaseIdEnabled(caseId),
    placeholderData: (previous, previousQuery) =>
      previousQuery !== undefined &&
      entityIdOfKey(previousQuery.queryKey) === entityId
        ? previous
        : undefined,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};
