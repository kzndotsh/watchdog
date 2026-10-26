import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { entityList } from "@watchdog/schemas/graph";

import type { DbExec } from "../exec";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { defineListRepo } from "./_list-query";
import { entityColumns } from "./entities.repo";

const connectionPeer = alias(entities, "connection_peer");

/**
 * One Connection of the row's Entity: a lateral `limit 1` read through the two endpoint indexes.
 * The service keeps it only when the Entity has exactly one.
 */
function soleConnection(exec: DbExec) {
  return exec
    .select({
      id: edges.id,
      fromId: edges.fromId,
      toId: edges.toId,
      predicate: edges.predicate,
      confidence: edges.confidence,
      notes: edges.notes,
      version: edges.version,
    })
    .from(edges)
    .where(or(eq(edges.fromId, entities.id), eq(edges.toId, entities.id)))
    .limit(1)
    .as("sole_connection");
}

/**
 * The Case's Entity list (`entityList`, ADR-0007): the Entities table and the server-searched
 * Entity pickers (#559). Builder API only, like the other list bindings. Each row carries its
 * Connection counts (correlated counts over the `from_id` and `to_id` indexes) and one
 * Connection, so the table's Connections cell needs no Case-wide Edge read.
 */
export const entityListRepo = defineListRepo(entityList, {
  table: entities,
  base: (exec, listKey) => {
    const sole = soleConnection(exec);
    return (
      exec
        .select({
          ...entityColumns,
          connections: {
            outgoing: exec.$count(edges, eq(edges.fromId, entities.id)),
            incoming: exec.$count(edges, eq(edges.toId, entities.id)),
          },
          soleConnection: {
            edgeId: sole.id,
            fromId: sole.fromId,
            toId: sole.toId,
            predicate: sole.predicate,
            confidence: sole.confidence,
            notes: sole.notes,
            version: sole.version,
            peerId: connectionPeer.id,
            peerName: connectionPeer.name,
            peerSlug: connectionPeer.slug,
            peerKind: connectionPeer.kind,
          },
          listKey,
        })
        .from(entities)
        .leftJoinLateral(sole, isNotNull(sole.id))
        // The other end of that Connection.
        .leftJoin(
          connectionPeer,
          or(
            and(eq(sole.fromId, entities.id), eq(connectionPeer.id, sole.toId)),
            and(eq(sole.toId, entities.id), eq(connectionPeer.id, sole.fromId))
          )
        )
        .$dynamic()
    );
  },
  id: entities.id,
  scopeColumn: entities.caseId,
  scope: ({ caseId }) => eq(entities.caseId, caseId),
  filters: {
    kind: (kinds) =>
      kinds.length > 0 ? inArray(entities.kind, [...kinds]) : undefined,
  },
  sorts: { name: entities.name, updated: entities.updatedAt },
  searchLabels: { kind: entities.kind },
  search: {
    name: entities.name,
    summary: entities.summary,
    notes: entities.notes,
  },
});

/**
 * A row of the Entity list: the Entity, its Connection counts, one of its Connections (null
 * when it has none) and its cursor value.
 */
export type EntityListRow = Awaited<
  ReturnType<typeof entityListRepo.page>
>[number];
