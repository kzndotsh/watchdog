import { queryOptions } from "@tanstack/react-query";

import type { ClaimRecord } from "@/domains/entities/claims/types";
import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { claimList } from "@watchdog/domain/schemas/graph";
import { opsOf, type ListQuery } from "@watchdog/domain/schemas/shared";

/**
 * Claims keys are the oRPC procedure keys (`[path, { input, type }]`): `all(caseId)` is the
 * partial key `[["claims"], { input: { caseId } }]`, which matches every Claims query of the
 * Case whatever its procedure, filters or cursor.
 */
export const claimsKeys = {
  all: (caseId: string) => orpc.claims.key({ input: { caseId } }),
};

/**
 * The Case's Claim list (`claimList`, ADR-0007), a page at a time through `claims.list`: the
 * Dossier Claims tab is this list with `entityId` fixed. Keys sit under `claimsKeys.all`, so
 * every Entity, Proposal and live Graph invalidation refreshes each open view.
 */
export const claimListView = listView(claimList, {
  procedure: orpc.claims.list,
  scopeInput: ({ caseId }: { readonly caseId: string }) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: ClaimRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/**
 * The Claims screen's tier tabs (`claims.confidenceCounts`): the view's Claims per confidence tier
 * and those citing no Evidence, counted with the tier and `uncited` filters cleared so every tab
 * keeps its count whichever is open. Under `claimsKeys.all`, so it refreshes with the list.
 */
export const claimConfidenceCountsQuery = (
  caseId: string,
  query: ListQuery<typeof claimList>
) => {
  const input = {
    ...opsOf(claimList).toSearch({
      ...query,
      filters: { ...query.filters, confidence: [], uncited: false },
    }),
    caseId: scopeCaseId(caseId),
  };
  return queryOptions({
    queryKey: orpc.claims.confidenceCounts.queryKey({ input }),
    queryFn: async () => orpc.claims.confidenceCounts.call(input),
    enabled: scopeCaseIdEnabled(caseId),
    placeholderData: (previous) => previous,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};
