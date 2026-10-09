import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import { entityChangedOpts } from "@/domains/entities/lib/entity-invalidation-opts";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { deleteIdentifierInputSchema } from "@watchdog/schemas/graph";

export interface DeleteIdentifierTarget {
  id: string;
  type: string;
  value: string;
  entityId: string;
  entitySlug?: string;
}

/** Delete an Identifier, then settle its Entity caches; the dialog owns open state and copy. */
export function useDeleteIdentifier({
  caseId,
  target,
  onOpenChange,
  onDeleted,
}: {
  caseId: string;
  target: DeleteIdentifierTarget | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: DeleteIdentifierTarget) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (identifierId: string) =>
      deleteIdentifierFn({
        data: deleteIdentifierInputSchema.parse({ caseId, identifierId }),
      }),
    onSuccess: async () => {
      if (!target) return;
      setError(null);
      onOpenChange(false);
      await invalidateAfterEntityChanged(
        queryClient,
        caseId,
        entityChangedOpts(
          queryClient,
          caseId,
          target.entityId,
          target.entitySlug
        )
      );
      toast.success("Identifier deleted");
      onDeleted?.(target);
    },
    onError: (caughtError) => {
      setError(errMessage(caughtError, "Delete failed"));
    },
  });

  return { deleteMutation, error, setError };
}
