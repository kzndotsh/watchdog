import type { ClaimRecord } from "@/domains/entities/claims/types";
import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { claimList } from "@watchdog/schemas/graph";

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
