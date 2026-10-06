import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";

import type { DossierEditFormValues } from "@/domains/dossier/components/dossier-edit-dialog";
import { updateEntityFieldsFn } from "@/domains/entities/entities.functions";
import { buildUpdateEntityFieldsData } from "@/domains/entities/lib/entity-write";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { TOAST_ENTITY_UPDATED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

export interface EntityMutationContext {
  caseId: string;
  entity: EntityRecord;
  queryClient: QueryClient;
  setEditOpen: (open: boolean) => void;
  setEditError: (message: string | null) => void;
  setRenameError: (message: string | null) => void;
}

async function invalidateDossierEntity(
  ctx: EntityMutationContext
): Promise<void> {
  await invalidateAfterEntityChanged(ctx.queryClient, ctx.caseId, {
    entityId: ctx.entity.id,
    slug: ctx.entity.slug,
  });
}

function renameEntity(ctx: EntityMutationContext, name: string) {
  return updateEntityFieldsFn({
    data: buildUpdateEntityFieldsData(ctx.caseId, {
      entityId: ctx.entity.id,
      name,
    }),
  });
}

async function onRenameSuccess(ctx: EntityMutationContext): Promise<void> {
  ctx.setRenameError(null);
  toast.success(TOAST_ENTITY_UPDATED);
  await invalidateDossierEntity(ctx);
}

function onRenameError(ctx: EntityMutationContext, err: unknown): void {
  ctx.setRenameError(errMessage(err, "Rename failed"));
}

function editEntity(ctx: EntityMutationContext, values: DossierEditFormValues) {
  return updateEntityFieldsFn({
    data: buildUpdateEntityFieldsData(ctx.caseId, {
      entityId: ctx.entity.id,
      kind: values.kind,
      name: values.name,
      summary: values.summary,
      notes: values.notes,
    }),
  });
}

async function onEditSuccess(ctx: EntityMutationContext): Promise<void> {
  ctx.setEditError(null);
  ctx.setEditOpen(false);
  toast.success(TOAST_ENTITY_UPDATED);
  await invalidateDossierEntity(ctx);
}

function onEditError(ctx: EntityMutationContext, err: unknown): void {
  ctx.setEditError(errMessage(err, "Update failed"));
}

export function useDossierShellMutations(ctx: EntityMutationContext) {
  const renameMutation = useMutation({
    mutationFn: async (name: string) => renameEntity(ctx, name),
    onSuccess: async () => onRenameSuccess(ctx),
    onError: (err) => {
      onRenameError(ctx, err);
    },
  });

  const editMutation = useMutation({
    mutationFn: async (values: DossierEditFormValues) =>
      editEntity(ctx, values),
    onSuccess: async () => onEditSuccess(ctx),
    onError: (err) => {
      onEditError(ctx, err);
    },
  });

  return { renameMutation, editMutation };
}
