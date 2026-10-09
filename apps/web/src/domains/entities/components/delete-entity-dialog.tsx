import { UserRoundIcon } from "lucide-react";

import { useDeleteEntity } from "@/domains/entities/hooks/use-delete-entity";
import type { EntityRecord } from "@/domains/entities/types";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";
import { entityDisplayLabel } from "@watchdog/schemas/shared";

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
  const { deleteMutation, error, setError } = useDeleteEntity({
    onOpenChange,
    onDeleted,
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
        if (entity) deleteMutation.mutate({ caseId, entity });
      }}
    />
  );
}
