import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import type { DossierEditFormValues } from "@/domains/dossier/components/dossier-edit-dialog";
import { updateEntityFieldsFn } from "@/domains/entities/entities.functions";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import {
  invalidateAfterEntityChanged,
  invalidateAfterTaskMutation,
} from "@/shared/lib/query-invalidation";
import type { WatchdogEvent } from "@watchdog/schemas";

function handleDossierLiveEvent(
  queryClient: QueryClient,
  caseId: string,
  entity: Pick<EntityRecord, "id" | "slug">,
  event: WatchdogEvent
): void {
  if (event.type === "entity_changed") {
    void invalidateAfterEntityChanged(queryClient, caseId, {
      entityId: entity.id,
      slug: entity.slug,
    });
  }
  if (event.type === "task_changed") {
    void invalidateAfterTaskMutation(queryClient, caseId);
  }
}

export function useDossierShellLiveInvalidation(
  caseId: string,
  entity: EntityRecord,
  queryClient: QueryClient
): void {
  const onEvent = useCallback(
    (event: WatchdogEvent) => {
      handleDossierLiveEvent(queryClient, caseId, entity, event);
    },
    [queryClient, caseId, entity]
  );
  useLiveEvents(caseId, onEvent);
}

export interface EntityMutationContext {
  caseId: string;
  entity: EntityRecord;
  queryClient: QueryClient;
  setEditOpen: (open: boolean) => void;
  setEditError: (message: string | null) => void;
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
    data: { caseId: ctx.caseId, entityId: ctx.entity.id, name },
  });
}

async function onRenameSuccess(ctx: EntityMutationContext): Promise<void> {
  toast.success("Updated");
  await invalidateDossierEntity(ctx);
}

function onRenameError(err: unknown): void {
  toast.error(errMessage(err, "Rename failed"));
}

function editEntity(ctx: EntityMutationContext, values: DossierEditFormValues) {
  return updateEntityFieldsFn({
    data: {
      caseId: ctx.caseId,
      entityId: ctx.entity.id,
      kind: values.kind,
      name: values.name,
      summary: values.summary,
      notes: values.notes,
    },
  });
}

async function onEditSuccess(ctx: EntityMutationContext): Promise<void> {
  ctx.setEditError(null);
  ctx.setEditOpen(false);
  toast.success("Updated");
  await invalidateDossierEntity(ctx);
}

function onEditError(ctx: EntityMutationContext, err: unknown): void {
  ctx.setEditError(errMessage(err, "Update failed"));
}

export function useDossierShellMutations(ctx: EntityMutationContext) {
  const renameMutation = useMutation({
    mutationFn: async (name: string) => renameEntity(ctx, name),
    onSuccess: async () => onRenameSuccess(ctx),
    onError: onRenameError,
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
