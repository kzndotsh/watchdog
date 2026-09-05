import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserRoundIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { deleteEntityFn } from "@/domains/entities/entities.functions";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";

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
      deleteEntityFn({ data: { caseId, entityId } }),
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

  return (
    <DestructiveConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title="Delete entity"
      description={
        entity
          ? `Delete “${entity.name}” and its identifiers, claims, events, connections, and questions. Evidence and tasks stay in the Case but lose this subject link.`
          : undefined
      }
      confirmLabel="Delete entity"
      verificationPhrase={entity?.name ?? ""}
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
