import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserRoundIcon } from "lucide-react";
import { useState } from "react";

import { deleteEntityFn } from "@/domains/entities/entities.functions";
import {
  deleteEntityInputSchema,
  type EntityRecord,
} from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";
import { toast } from "@/shared/ui/shadcn/toast";
import { entityDisplayLabel } from "@watchdog/schemas";

export function DeleteEntityDialog({
  caseId,
  entity,
  open,
  onOpenChange,
  onDeleted,
}: {
  caseId: string;
  entity: Pick<EntityRecord, "id" | "name" | "slug"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: Pick<EntityRecord, "id" | "name" | "slug">) => void;
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

  const displayName = entity === null ? null : entityDisplayLabel(entity);

  return (
    <DestructiveConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title="Delete entity"
      description={
        displayName
          ? `Deletes ${displayName} and all graph content tied to it. Evidence and tasks remain in the Case.`
          : undefined
      }
      confirmLabel="Delete entity"
      verificationPhrase={displayName ?? ""}
      verificationLabel="Type the entity name"
      irreversibility="Deleting this entity cannot be undone."
      media={<UserRoundIcon />}
      loading={deleteMutation.isPending}
      error={error}
      onConfirm={() => {
        if (entity) deleteMutation.mutate(entity.id);
      }}
    />
  );
}
