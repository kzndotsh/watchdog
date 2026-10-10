import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ClaimFormValues } from "@/domains/dossier/lib/claim-form";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { updateClaimFn } from "@/domains/entities/claims/claims.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { updateClaimInputSchema } from "@watchdog/schemas/graph";

export type UpdateClaimVariables = DossierEntityScope & {
  claimId: string;
  value: ClaimFormValues;
};

/** Edit a Claim, then settle its Entity caches. */
export function useUpdateClaim({ onUpdated }: { onUpdated?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, claimId, value }: UpdateClaimVariables) =>
      updateClaimFn({
        data: updateClaimInputSchema.parse({
          caseId,
          claimId,
          text: value.text,
          class: value.claimClass,
          confidence: value.confidence,
          evidenceIds: value.evidenceIds,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onUpdated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Claim updated");
    },
  });
}
