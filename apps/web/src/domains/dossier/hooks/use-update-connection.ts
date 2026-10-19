import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ConnectionFormValues } from "@/domains/dossier/components/ego-graph/connection-dialog";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { updateEdgeFn } from "@/domains/entities/edges/edges.functions";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import { buildUpdateEdgeData } from "@/domains/entities/lib/edge-write";
import { couldnt, errMessage } from "@/lib/utils";
import { useStaleVersionToast } from "@/shared/hooks/use-stale-version-toast";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";

export type UpdateConnectionVariables = DossierEntityScope & {
  edge: EdgeRecord;
  /** The Edge's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  values: ConnectionFormValues;
};

/** Edit a Connection (Edge), then settle its Entity caches. */
export function useUpdateConnection({
  onUpdated,
  onError,
  onReload,
}: {
  onUpdated?: () => void;
  onError?: (message: string) => void;
  onReload?: () => void;
} = {}) {
  const queryClient = useQueryClient();
  const notifyStale = useStaleVersionToast();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      entityId,
      edge,
      expectedVersion,
      values,
    }: UpdateConnectionVariables) =>
      updateEdgeFn({
        data: buildUpdateEdgeData({
          caseId,
          centerId: entityId,
          edgeId: edge.id,
          expectedVersion,
          core: {
            peerId: values.peerId,
            predicate: values.predicate,
            orientation: values.orientation,
            notes: values.notes,
          },
          existing: {
            fromId: edge.fromId,
            toId: edge.toId,
            peerId: edge.peerId,
          },
          confidence: values.confidence,
          evidenceIds: values.evidenceIds,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      toast.success("Connection updated");
      onUpdated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
    },
    onError: (caughtError, { caseId, entityId, entitySlug }) => {
      notifyStale(caughtError, {
        noun: "connection",
        caseId,
        entityId,
        entitySlug,
        onReload,
      });
      onError?.(errMessage(caughtError, couldnt("update", "connection")));
    },
  });
}
