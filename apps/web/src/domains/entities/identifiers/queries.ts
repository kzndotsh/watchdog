import { queryOptions } from "@tanstack/react-query";

import {
  countIdentifierTypesFn,
  listIdentifiersPageFn,
} from "@/domains/entities/identifiers/identifiers.functions";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { identifierList } from "@watchdog/schemas/graph";
import { opsOf, type ListQuery } from "@watchdog/schemas/shared";

export const identifiersKeys = {
  all: (caseId: string) => ["identifiers", caseId] as const,
};

/** The scope of the Case's Identifier list: one per Case. */
export type IdentifierListScope = { readonly caseId: string };

/**
 * The Case's Identifier list (`identifierList`, ADR-0007), a page at a time: the Identifiers
 * table, and the Dossier tab with `entityId` fixed. Keys sit under `identifiersKeys.all`, so
 * every Entity and Proposal invalidation refreshes each open view.
 */
export const identifierListView = listView(identifierList, {
  domain: "identifiers",
  scopeKey: ({ caseId }: IdentifierListScope) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listIdentifiersPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: CaseIdentifierRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

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
  const scopedCaseId = scopeCaseId(caseId);
  const ops = opsOf(identifierList);
  const entityId = query.filters.entityId ?? null;
  return queryOptions({
    queryKey: [
      ...identifiersKeys.all(scopedCaseId),
      "type-counts",
      entityId,
      ops.keyOf(query),
    ] as const,
    queryFn: async () =>
      countIdentifierTypesFn({
        data: { ...ops.toSearch(query), caseId: scopedCaseId },
      }),
    enabled: scopeCaseIdEnabled(caseId),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === entityId ? previous : undefined,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};
