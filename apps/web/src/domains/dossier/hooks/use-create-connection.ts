import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ConnectionFormValues } from "@/domains/dossier/components/ego-graph/connection-dialog";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { createEdgeFn } from "@/domains/entities/edges/edges.functions";
import { buildCreateEdgeData } from "@/domains/entities/lib/edge-write";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";

export type CreateConnectionVariables = DossierEntityScope & {
  values: ConnectionFormValues;
};

/** Add a Connection (Edge) from an Entity, then settle its Entity caches. */
export function useCreateConnection({
  onCreated,
  onError,
}: {
  onCreated?: () => void;
  onError?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      entityId,
      values,
    }: CreateConnectionVariables) =>
      createEdgeFn({
        data: buildCreateEdgeData({
          caseId,
          centerId: entityId,
          core: {
            peerId: values.peerId,
            predicate: values.predicate,
            orientation: values.orientation,
            notes: values.notes,
          },
          confidence: values.confidence,
          evidenceIds: values.evidenceIds,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      toast.success("Connection added");
      onCreated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
    },
    onError: (caughtError) => {
      onError?.(errMessage(caughtError, "Failed to add"));
    },
  });
}
