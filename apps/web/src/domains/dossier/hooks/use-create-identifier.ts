import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { createIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { TOAST_IDENTIFIER_ADDED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import { createIdentifierInputSchema } from "@watchdog/schemas/graph";
import {
  normalizeIdentifierPlatform,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/schemas/shared";

export type CreateIdentifierVariables = DossierEntityScope & {
  value: {
    type: IdentifierType;
    value: string;
    platform: string;
    status: IdentifierStatus;
    confidence: ConfidenceTier;
    evidenceIds: string[];
  };
};

/** Add an Identifier to an Entity, then settle its Entity caches. */
export function useCreateIdentifier() {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      entityId,
      value,
    }: CreateIdentifierVariables) => {
      const platform = normalizeIdentifierPlatform(value.platform);
      return createIdentifierFn({
        data: createIdentifierInputSchema.parse({
          caseId,
          entityId,
          type: value.type,
          value: value.value,
          platform: platform || undefined,
          status: value.status,
          confidence: value.confidence,
          evidenceIds: value.evidenceIds,
        }),
      });
    },
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      toast.success(TOAST_IDENTIFIER_ADDED);
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
    },
  });
}
