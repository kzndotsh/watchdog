import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteEntityFn } from "@/domains/entities/entities.functions";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { deleteEntityInputSchema } from "@watchdog/schemas/graph";

type DeletedEntity = Pick<EntityRecord, "id" | "name" | "slug">;

export interface DeleteEntityVariables {
  caseId: string;
  entity: DeletedEntity;
}

/** Delete an Entity, then settle the Case graph caches; the dialog owns open state and copy. */
export function useDeleteEntity({
  onOpenChange,
  onDeleted,
}: {
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: DeletedEntity) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    // Case and Entity travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending deletion must settle the Case it was started for.
    mutationFn: async ({ caseId, entity }: DeleteEntityVariables) =>
      deleteEntityFn({
        data: deleteEntityInputSchema.parse({ caseId, entityId: entity.id }),
      }),
    onSuccess: async (_data, { caseId, entity }) => {
      setError(null);
      onOpenChange(false);
      await invalidateAfterEntityChanged(queryClient, caseId);
      toast.success("Entity deleted");
      onDeleted?.(entity);
    },
    onError: (caughtError) => {
      setError(errMessage(caughtError, "Delete failed"));
    },
  });

  return { deleteMutation, error, setError };
}
