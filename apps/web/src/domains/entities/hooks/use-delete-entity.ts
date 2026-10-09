import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteEntityFn } from "@/domains/entities/entities.functions";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { deleteEntityInputSchema } from "@watchdog/schemas/graph";

type DeletedEntity = Pick<EntityRecord, "id" | "name" | "slug">;

/** Delete an Entity, then settle the Case graph caches; the dialog owns open state and copy. */
export function useDeleteEntity({
  caseId,
  entity,
  onOpenChange,
  onDeleted,
}: {
  caseId: string;
  entity: DeletedEntity | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: DeletedEntity) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (entityId: string) =>
      deleteEntityFn({
        data: deleteEntityInputSchema.parse({ caseId, entityId }),
      }),
    onSuccess: async () => {
      if (!entity) return;
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
