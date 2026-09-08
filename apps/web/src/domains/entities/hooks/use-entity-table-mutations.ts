import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import {
  createEdgeFn,
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
import { createEntityInputSchema } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/shadcn/toast";
import type { EntityKind } from "@watchdog/schemas";

interface UpdateEntityVars {
  entityId: string;
  kind?: EntityKind;
  summary?: string | null;
  notes?: string | null;
}

interface ConnectionVars {
  centerId: string;
  input: CreateEntityConnectionInput;
}

interface ConnectionUpdateVars {
  centerId: string;
  input: UpdateEntityConnectionInput;
}

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
  toast.success("Updated");
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    entityChangedOpts(queryClient, caseId, entityId)
  );
}

function onEntityFieldsError(error: unknown): void {
  toast.error(errMessage(error, "Update failed"));
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
  toast.success("Connection added");
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
  toast.success("Connection updated");
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
  toast.success("Entity created");
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    entityChangedOpts(queryClient, caseId, created.id, created.slug)
  );
}

function buildEntityTableMutationHandlers(
  updateMutation: { mutate: (vars: UpdateEntityVars) => void },
  connectionMutation: {
    mutateAsync: (vars: ConnectionVars) => Promise<unknown>;
  },
  connectionUpdateMutation: {
    mutateAsync: (vars: ConnectionUpdateVars) => Promise<unknown>;
  },
  createEntity: (name: string, kind: EntityKind) => Promise<void>
) {
  return {
    updateKind(entityId: string, kind: EntityKind) {
      updateMutation.mutate({ entityId, kind });
    },
    updateSummary(entityId: string, summary: string) {
      updateMutation.mutate({ entityId, summary });
    },
    updateNotes(entityId: string, notes: string) {
      updateMutation.mutate({ entityId, notes });
    },
    async createConnection(
      centerId: string,
      input: CreateEntityConnectionInput
    ) {
      await connectionMutation.mutateAsync({ centerId, input });
    },
    async updateConnection(
      centerId: string,
      input: UpdateEntityConnectionInput
    ) {
      await connectionUpdateMutation.mutateAsync({ centerId, input });
    },
    createEntity,
  };
}

export function useEntityTableMutations(caseId: string) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (vars: UpdateEntityVars) =>
      updateEntityFields(caseId, vars),
    onSuccess: async (_data, vars) =>
      onEntityFieldsUpdated(queryClient, caseId, vars.entityId),
    onError: onEntityFieldsError,
  });

  const connectionMutation = useMutation({
    mutationFn: async (vars: ConnectionVars) =>
      createEntityConnection(caseId, vars),
    onSuccess: async (_data, vars) =>
      onConnectionCreated(queryClient, caseId, vars.centerId),
    onError: (error) => {
      toast.error(errMessage(error, "Connection failed"));
    },
  });

  const connectionUpdateMutation = useMutation({
    mutationFn: async (vars: ConnectionUpdateVars) =>
      updateEntityConnection(caseId, vars),
    onSuccess: async (_data, vars) =>
      onConnectionUpdated(queryClient, caseId, vars.centerId),
    onError: (error) => {
      toast.error(errMessage(error, "Connection update failed"));
    },
  });

  const createEntity = async (name: string, kind: EntityKind) =>
    createEntityRecord(caseId, queryClient, name, kind);

  return buildEntityTableMutationHandlers(
    updateMutation,
    connectionMutation,
    connectionUpdateMutation,
    createEntity
  );
}
