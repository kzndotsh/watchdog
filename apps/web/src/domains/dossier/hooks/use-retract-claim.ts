import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { retractClaimFn } from "@/domains/entities/claims/claims.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { retractClaimInputSchema } from "@watchdog/schemas/graph";
import type { RetractKind } from "@watchdog/schemas/shared";

export type RetractClaimVariables = DossierEntityScope & {
  claimId: string;
  kind: RetractKind;
  reason: string;
};

/** Retract, disprove or otherwise withdraw a Claim, then settle its Entity caches. */
export function useRetractClaim({
  successMessage,
  onRetracted,
}: {
  /** Toast copy for the action the form was opened for. */
  successMessage: string;
  onRetracted?: () => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      claimId,
      kind,
      reason,
    }: RetractClaimVariables) =>
      retractClaimFn({
        data: retractClaimInputSchema.parse({
          caseId,
          claimId,
          kind,
          reason,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onRetracted?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success(successMessage);
    },
  });
}
