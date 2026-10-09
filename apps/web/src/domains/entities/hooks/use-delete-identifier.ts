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

export interface DeleteIdentifierVariables {
  caseId: string;
  target: DeleteIdentifierTarget;
}

/** Delete an Identifier, then settle its Entity caches; the dialog owns open state and copy. */
export function useDeleteIdentifier({
  onOpenChange,
  onDeleted,
}: {
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: DeleteIdentifierTarget) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending deletion must settle the Case it was started for.
    mutationFn: async ({ caseId, target }: DeleteIdentifierVariables) =>
      deleteIdentifierFn({
        data: deleteIdentifierInputSchema.parse({
          caseId,
          identifierId: target.id,
        }),
      }),
    onSuccess: async (_data, { caseId, target }) => {
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
