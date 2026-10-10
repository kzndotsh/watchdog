import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { deleteEdgeFn } from "@/domains/entities/edges/edges.functions";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { edgeScopeInputSchema } from "@watchdog/schemas/graph";

export type DeleteConnectionVariables = DossierEntityScope & {
  edgeId: string;
};

/** Delete a Connection (Edge), then settle its Entity caches. */
export function useDeleteConnection({
  onDeleted,
  onError,
}: {
  onDeleted?: () => void;
  onError?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, edgeId }: DeleteConnectionVariables) =>
      deleteEdgeFn({
        data: edgeScopeInputSchema.parse({ caseId, edgeId }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onDeleted?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Connection deleted");
    },
    onError: (caughtError) => {
      onError?.(errMessage(caughtError, "Delete failed"));
    },
  });
}
