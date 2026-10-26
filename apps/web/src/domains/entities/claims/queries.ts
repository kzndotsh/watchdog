import { listClaimsPageFn } from "@/domains/entities/claims/claims.functions";
import type { ClaimRecord } from "@/domains/entities/claims/types";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { claimList } from "@watchdog/schemas/graph";

export const claimsKeys = {
  prefix: (caseId: string) => ["claims", caseId] as const,
};

/**
 * The Case's Claim list (`claimList`, ADR-0007), a page at a time: the Dossier Claims tab is this
 * list with `entityId` fixed. Keys sit under `claimsKeys.prefix`, so every Entity, Proposal and live
 * Graph invalidation refreshes each open view.
 */
export const claimListView = listView(claimList, {
  domain: "claims",
  scopeKey: ({ caseId }: { readonly caseId: string }) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listClaimsPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: ClaimRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});
