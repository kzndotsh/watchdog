import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { updateIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import {
  buildUpdateIdentifierData,
  type UpdateIdentifierPatch,
} from "@/domains/entities/lib/identifier-write";
import { couldnt, errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { TOAST_IDENTIFIER_UPDATED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

export type UpdateIdentifierVariables = DossierEntityScope & {
  patch: UpdateIdentifierPatch;
};

/** Edit an Identifier, then settle its Entity caches. */
export function useUpdateIdentifier({
  onUpdated,
  onError,
}: {
  onUpdated?: () => void;
  onError?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, patch }: UpdateIdentifierVariables) =>
      updateIdentifierFn({
        data: buildUpdateIdentifierData(caseId, patch),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onUpdated?.();
      toast.success(TOAST_IDENTIFIER_UPDATED);
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
    },
    onError: (caughtError) => {
      onError?.(errMessage(caughtError, couldnt("update", "identifier")));
    },
  });
}
