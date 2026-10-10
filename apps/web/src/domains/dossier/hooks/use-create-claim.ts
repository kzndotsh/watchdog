import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ClaimFormValues } from "@/domains/dossier/lib/claim-form";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { createClaimFn } from "@/domains/entities/claims/claims.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { createClaimInputSchema } from "@watchdog/schemas/graph";

export type CreateClaimVariables = DossierEntityScope & {
  value: ClaimFormValues;
};

/** Add a Claim to an Entity, then settle its Entity caches. */
export function useCreateClaim({ onCreated }: { onCreated?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, entityId, value }: CreateClaimVariables) =>
      createClaimFn({
        data: createClaimInputSchema.parse({
          caseId,
          entityId,
          text: value.text,
          class: value.claimClass,
          confidence: value.confidence,
          evidenceIds: value.evidenceIds,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onCreated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Claim saved");
    },
  });
}
