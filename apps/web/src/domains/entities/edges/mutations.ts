import {
  createEdgeFn,
  deleteEdgeFn,
  updateEdgeFn,
} from "@/domains/entities/edges/edges.functions";
import type {
  ConnectionFormValues,
  EdgeRecord,
} from "@/domains/entities/edges/types";
import { defineGraphChildMutation } from "@/domains/entities/hooks/use-graph-child-mutation";
import {
  buildCreateEdgeData,
  buildUpdateEdgeData,
} from "@/domains/entities/lib/edge-write";
import type { EntityScope } from "@/domains/entities/types";
import { edgeScopeInputSchema } from "@watchdog/schemas/graph";

export type CreateConnectionVariables = EntityScope & {
  values: ConnectionFormValues;
};

/** Add a Connection (Edge) from an Entity. */
export const useCreateConnection = defineGraphChildMutation({
  fn: createEdgeFn,
  parse: ({ caseId, entityId, values }: CreateConnectionVariables) =>
    buildCreateEdgeData({
      caseId,
      centerId: entityId,
      core: {
        peerId: values.peerId,
        predicate: values.predicate,
        orientation: values.orientation,
        notes: values.notes,
      },
      confidence: values.confidence,
      evidenceIds: values.evidenceIds,
    }),
  success: "Connection added",
  verb: "add",
  noun: "connection",
});

export type UpdateConnectionVariables = EntityScope & {
  edge: EdgeRecord;
  /** The Edge's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  values: ConnectionFormValues;
};

/** Edit a Connection (Edge). */
export const useUpdateConnection = defineGraphChildMutation({
  fn: updateEdgeFn,
  parse: ({
    caseId,
    entityId,
    edge,
    expectedVersion,
    values,
  }: UpdateConnectionVariables) =>
    buildUpdateEdgeData({
      caseId,
      centerId: entityId,
      edgeId: edge.id,
      expectedVersion,
      core: {
        peerId: values.peerId,
        predicate: values.predicate,
        orientation: values.orientation,
        notes: values.notes,
      },
      existing: { fromId: edge.fromId, toId: edge.toId, peerId: edge.peerId },
      confidence: values.confidence,
      evidenceIds: values.evidenceIds,
    }),
  success: "Connection updated",
  verb: "update",
  noun: "connection",
});

export type DeleteConnectionVariables = EntityScope & { edgeId: string };

/** Delete a Connection (Edge). */
export const useDeleteConnection = defineGraphChildMutation({
  fn: deleteEdgeFn,
  parse: ({ caseId, edgeId }: DeleteConnectionVariables) =>
    edgeScopeInputSchema.parse({ caseId, edgeId }),
  success: "Connection deleted",
  verb: "delete",
  noun: "connection",
});
