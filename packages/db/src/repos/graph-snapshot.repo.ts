import { and, desc, eq, inArray, or } from "drizzle-orm";

import type { CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { trimCaseId, trimScopedCaseIds } from "./_scoped-ids";

/**
 * The Case graph's capped snapshot (#570): the Entities the graph draws and the Connections
 * between them, never the whole Case. Reads the tables directly: the Case is already authorised
 * by the caller.
 */
export const graphSnapshotRepo = {
  /**
   * The Case's `limit` most connected Entities: by Connection count (both directions), then most
   * recently updated, then id. The count is a correlated count over the `from_id` and `to_id`
   * indexes, scoped to the Case like every other read here. Ask for one more than the cap to learn it was cut.
   */
  async mostConnectedEntities(exec: DbExec, caseId: CaseId, limit: number) {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const connections = exec.$count(
      edges,
      and(
        eq(edges.caseId, scopedCaseId),
        or(eq(edges.fromId, entities.id), eq(edges.toId, entities.id))
      )
    );
    return exec
      .select({
        id: entities.id,
        name: entities.name,
        slug: entities.slug,
        kind: entities.kind,
      })
      .from(entities)
      .where(eq(entities.caseId, scopedCaseId))
      .orderBy(desc(connections), desc(entities.updatedAt), desc(entities.id))
      .limit(limit);
  },

  /**
   * The Case's Connections whose two ends are both in `entityIds`, most recently updated first,
   * at most `limit`. An empty id list reads nothing.
   */
  async edgesAmong(
    exec: DbExec,
    caseId: CaseId,
    entityIds: readonly string[],
    limit: number
  ) {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined || entityIds.length === 0) return [];
    const ids = [...entityIds];
    return exec
      .select({
        id: edges.id,
        fromId: edges.fromId,
        toId: edges.toId,
        predicate: edges.predicate,
        confidence: edges.confidence,
      })
      .from(edges)
      .where(
        and(
          eq(edges.caseId, scopedCaseId),
          inArray(edges.fromId, ids),
          inArray(edges.toId, ids)
        )
      )
      .orderBy(desc(edges.updatedAt), desc(edges.id))
      .limit(limit);
  },

  /**
   * One Entity's Connections for the Dossier ego graph (#585), at either end, most recently
   * updated first, at most `limit`, each with the label of its other end (the peer). The two
   * indexes led by `from_id` and `to_id` find them; the cut happens before the peer join, so a
   * hub's peers are read only for the Connections kept.
   */
  async egoEdges(
    exec: DbExec,
    caseId: CaseId,
    entityId: string,
    limit: number
  ) {
    const scoped = trimScopedCaseIds(caseId, entityId);
    if (!scoped) return [];
    const center = scoped.resourceId;
    const kept = exec
      .select({
        id: edges.id,
        fromId: edges.fromId,
        toId: edges.toId,
        predicate: edges.predicate,
        confidence: edges.confidence,
        updatedAt: edges.updatedAt,
      })
      .from(edges)
      .where(
        and(
          eq(edges.caseId, scoped.caseId),
          or(eq(edges.fromId, center), eq(edges.toId, center))
        )
      )
      .orderBy(desc(edges.updatedAt), desc(edges.id))
      .limit(limit)
      .as("ego");
    return exec
      .select({
        id: kept.id,
        fromId: kept.fromId,
        toId: kept.toId,
        predicate: kept.predicate,
        confidence: kept.confidence,
        peer: {
          id: entities.id,
          name: entities.name,
          slug: entities.slug,
          kind: entities.kind,
        },
      })
      .from(kept)
      .innerJoin(
        entities,
        or(
          and(eq(kept.fromId, center), eq(entities.id, kept.toId)),
          and(eq(kept.toId, center), eq(entities.id, kept.fromId))
        )
      )
      .orderBy(desc(kept.updatedAt), desc(kept.id));
  },
};

export type GraphSnapshotEntityRow = Awaited<
  ReturnType<typeof graphSnapshotRepo.mostConnectedEntities>
>[number];
export type GraphSnapshotEdgeRow = Awaited<
  ReturnType<typeof graphSnapshotRepo.edgesAmong>
>[number];
export type GraphEgoEdgeRow = Awaited<
  ReturnType<typeof graphSnapshotRepo.egoEdges>
>[number];
