import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ClaimFormValues } from "@/domains/dossier/lib/claim-form";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { updateClaimFn } from "@/domains/entities/claims/claims.functions";
import { useStaleVersionToast } from "@/shared/hooks/use-stale-version-toast";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { updateClaimInputSchema } from "@watchdog/schemas/graph";

export type UpdateClaimVariables = DossierEntityScope & {
  claimId: string;
  /** The Claim's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  value: ClaimFormValues;
};

/** Edit a Claim, then settle its Entity caches. */
export function useUpdateClaim({
  onUpdated,
  onReload,
}: { onUpdated?: () => void; onReload?: () => void } = {}) {
  const queryClient = useQueryClient();
  const notifyStale = useStaleVersionToast();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      claimId,
      expectedVersion,
      value,
    }: UpdateClaimVariables) =>
      updateClaimFn({
        data: updateClaimInputSchema.parse({
          caseId,
          claimId,
          expectedVersion,
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
    onError: (caughtError, { caseId, entityId, entitySlug }) => {
      notifyStale(caughtError, {
        noun: "claim",
        caseId,
        entityId,
        entitySlug,
        onReload,
      });
    },
  });
}
