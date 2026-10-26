import { listIdentifiersPageFn } from "@/domains/entities/identifiers/identifiers.functions";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { identifierList } from "@watchdog/schemas/graph";

export const identifiersKeys = {
  prefix: (caseId: string) => ["identifiers", caseId] as const,
};

/** The scope of the Case's Identifier list: one per Case. */
export type IdentifierListScope = { readonly caseId: string };

/**
 * The Case's Identifier list (`identifierList`, ADR-0007), a page at a time: the Identifiers
 * table, and the Dossier tab with `entityId` fixed. Keys sit under `identifiersKeys.prefix`, so
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
