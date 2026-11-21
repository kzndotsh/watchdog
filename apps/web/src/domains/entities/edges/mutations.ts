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
import { orpc } from "@/lib/orpc-client";

export type CreateConnectionVariables = EntityScope & {
  values: ConnectionFormValues;
};

/** Add a Connection (Edge) from an Entity. */
export const useCreateConnection = defineGraphChildMutation({
  call: orpc.edges.create.call,
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
  call: orpc.edges.update.call,
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
  call: orpc.edges.delete.call,
  parse: ({ caseId, edgeId }: DeleteConnectionVariables) => ({
    caseId,
    edgeId,
  }),
  success: "Connection deleted",
  verb: "delete",
  noun: "connection",
});
