import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import type { EntityEditTarget } from "@/domains/entities/components/entity-table.columns";
import {
  createEdgeFn,
  deleteEdgeFn,
  updateEdgeFn,
} from "@/domains/entities/edges/edges.functions";
import {
  createEntityFn,
  updateEntityFieldsFn,
} from "@/domains/entities/entities.functions";
import {
  buildCreateEdgeData,
  buildUpdateEdgeData,
  type CreateEntityConnectionInput,
  type UpdateEntityConnectionInput,
} from "@/domains/entities/lib/edge-write";
import { entityChangedOpts } from "@/domains/entities/lib/entity-invalidation-opts";
import { buildUpdateEntityFieldsData } from "@/domains/entities/lib/entity-write";
import { couldnt, errMessage } from "@/lib/utils";
import { useStaleVersionToast } from "@/shared/hooks/use-stale-version-toast";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import {
  TOAST_ENTITY_CREATED,
  TOAST_ENTITY_UPDATED,
} from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import {
  edgeScopeInputSchema,
  createEntityInputSchema,
} from "@watchdog/schemas/graph";
import type { EntityKind } from "@watchdog/schemas/shared";

type UpdateEntityVars = {
  entityId: string;
  expectedVersion: number;
  kind?: EntityKind;
  summary?: string | null;
  notes?: string | null;
};

type ConnectionVars = {
  centerId: string;
  input: CreateEntityConnectionInput;
};

type ConnectionUpdateVars = {
  centerId: string;
  input: UpdateEntityConnectionInput;
};

type ConnectionDeleteVars = {
  centerId: string;
  edgeId: string;
};

function updateEntityFields(caseId: string, vars: UpdateEntityVars) {
  return updateEntityFieldsFn({
    data: buildUpdateEntityFieldsData(caseId, vars),
  });
}

async function onEntityFieldsUpdated(
  queryClient: QueryClient,
  caseId: string,
  entityId: string
): Promise<void> {
  toast.success(TOAST_ENTITY_UPDATED);
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    entityChangedOpts(queryClient, caseId, entityId)
  );
}

function onEntityFieldsError(error: unknown): void {
  toast.error(errMessage(error, couldnt("update", "entity")));
}

function createEntityConnection(caseId: string, vars: ConnectionVars) {
  return createEdgeFn({
    data: buildCreateEdgeData({
      caseId,
      centerId: vars.centerId,
      core: vars.input,
    }),
  });
}

async function onConnectionCreated(
  queryClient: QueryClient,
  caseId: string,
  centerId: string
): Promise<void> {
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    entityChangedOpts(queryClient, caseId, centerId)
  );
}

function updateEntityConnection(caseId: string, vars: ConnectionUpdateVars) {
  return updateEdgeFn({
    data: buildUpdateEdgeData({
      caseId,
      centerId: vars.centerId,
      edgeId: vars.input.edgeId,
      expectedVersion: vars.input.expectedVersion,
      core: vars.input,
      existing: {
        fromId: vars.input.existingFromId,
        toId: vars.input.existingToId,
        peerId: vars.input.existingPeerId,
      },
    }),
  });
}

async function onConnectionUpdated(
  queryClient: QueryClient,
  caseId: string,
  centerId: string
): Promise<void> {
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    entityChangedOpts(queryClient, caseId, centerId)
  );
}

function deleteEntityConnection(caseId: string, vars: ConnectionDeleteVars) {
  return deleteEdgeFn({
    data: edgeScopeInputSchema.parse({
      caseId,
      edgeId: vars.edgeId,
    }),
  });
}

async function onConnectionDeleted(
  queryClient: QueryClient,
  caseId: string,
  centerId: string
): Promise<void> {
  toast.success("Connection deleted");
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    entityChangedOpts(queryClient, caseId, centerId)
  );
}

async function createEntityRecord(
  caseId: string,
  queryClient: QueryClient,
  name: string,
  kind: EntityKind
): Promise<void> {
  const created = await createEntityFn({
    data: createEntityInputSchema.parse({
      caseId,
      kind,
      name,
    }),
  });
  toast.success(TOAST_ENTITY_CREATED);
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    entityChangedOpts(queryClient, caseId, created.id, created.slug)
  );
}

function buildEntityTableMutationHandlers(
  updateMutation: {
    mutate: (vars: UpdateEntityVars) => void;
    mutateAsync: (vars: UpdateEntityVars) => Promise<unknown>;
  },
  connectionMutation: {
    mutateAsync: (vars: ConnectionVars) => Promise<unknown>;
  },
  connectionUpdateMutation: {
    mutateAsync: (vars: ConnectionUpdateVars) => Promise<unknown>;
  },
  connectionDeleteMutation: {
    mutateAsync: (vars: ConnectionDeleteVars) => Promise<unknown>;
  },
  createEntity: (name: string, kind: EntityKind) => Promise<void>
) {
  return {
    updateKind: (target: EntityEditTarget, kind: EntityKind) => {
      updateMutation.mutate({
        entityId: target.id,
        expectedVersion: target.version,
        kind,
      });
    },
    updateSummary: (target: EntityEditTarget, summary: string) => {
      updateMutation.mutate({
        entityId: target.id,
        expectedVersion: target.version,
        summary,
      });
    },
    updateNotes: async (target: EntityEditTarget, notes: string) => {
      await updateMutation.mutateAsync({
        entityId: target.id,
        expectedVersion: target.version,
        notes,
      });
    },
    createConnection: async (
      centerId: string,
      input: CreateEntityConnectionInput
    ) => {
      await connectionMutation.mutateAsync({ centerId, input });
    },
    updateConnection: async (
      centerId: string,
      input: UpdateEntityConnectionInput
    ) => {
      await connectionUpdateMutation.mutateAsync({ centerId, input });
    },
    deleteConnection: async (centerId: string, edgeId: string) => {
      await connectionDeleteMutation.mutateAsync({ centerId, edgeId });
    },
    createEntity,
  };
}

export function useEntityTableMutations(caseId: string) {
  const queryClient = useQueryClient();
  const notifyStale = useStaleVersionToast();

  const updateMutation = useMutation({
    mutationFn: async (vars: UpdateEntityVars) =>
      updateEntityFields(caseId, vars),
    onSuccess: async (_data, vars) =>
      onEntityFieldsUpdated(queryClient, caseId, vars.entityId),
    onError: (error, vars) => {
      const handled = notifyStale(error, {
        noun: "entity",
        caseId,
        entityId: vars.entityId,
      });
      if (!handled) onEntityFieldsError(error);
    },
  });

  const connectionMutation = useMutation({
    mutationFn: async (vars: ConnectionVars) =>
      createEntityConnection(caseId, vars),
    onSuccess: async (_data, vars) =>
      onConnectionCreated(queryClient, caseId, vars.centerId),
  });

  const connectionUpdateMutation = useMutation({
    mutationFn: async (vars: ConnectionUpdateVars) =>
      updateEntityConnection(caseId, vars),
    onSuccess: async (_data, vars) =>
      onConnectionUpdated(queryClient, caseId, vars.centerId),
    onError: (error, vars) => {
      notifyStale(error, {
        noun: "connection",
        caseId,
        entityId: vars.centerId,
      });
    },
  });

  const connectionDeleteMutation = useMutation({
    mutationFn: async (vars: ConnectionDeleteVars) =>
      deleteEntityConnection(caseId, vars),
    onSuccess: async (_data, vars) =>
      onConnectionDeleted(queryClient, caseId, vars.centerId),
    onError: (error) => {
      toast.error(errMessage(error, couldnt("delete", "connection")));
    },
  });

  const createEntity = async (name: string, kind: EntityKind) =>
    createEntityRecord(caseId, queryClient, name, kind);

  return buildEntityTableMutationHandlers(
    updateMutation,
    connectionMutation,
    connectionUpdateMutation,
    connectionDeleteMutation,
    createEntity
  );
}
