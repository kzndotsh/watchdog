import { eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { edgeList } from "@watchdog/schemas/graph";

import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { defineListRepo } from "./_list-query";
import { edgeColumns } from "./edges.repo";

const fromEntity = alias(entities, "from_entity");
const toEntity = alias(entities, "to_entity");

/**
 * The Case's Connection list (`edgeList`, ADR-0007): one per Case. Each row carries both ends'
 * labels (display joins, never sorted or searched), so the screen orients it. An Entity's
 * Connections are this list with `entityId` fixed: a Connection at either end, found through
 * `edges_natural_uidx` (led by `from_id`) and `edges_to_id_idx`.
 */
export const edgeListRepo = defineListRepo(edgeList, {
  table: edges,
  base: (exec, listKey) =>
    exec
      .select({
        ...edgeColumns,
        fromName: fromEntity.name,
        fromSlug: fromEntity.slug,
        fromKind: fromEntity.kind,
        toName: toEntity.name,
        toSlug: toEntity.slug,
        toKind: toEntity.kind,
        listKey,
      })
      .from(edges)
      .innerJoin(fromEntity, eq(edges.fromId, fromEntity.id))
      .innerJoin(toEntity, eq(edges.toId, toEntity.id))
      .$dynamic(),
  id: edges.id,
  scopeColumn: edges.caseId,
  scope: ({ caseId }) => eq(edges.caseId, caseId),
  filters: {
    predicate: (predicates) =>
      predicates.length > 0
        ? inArray(edges.predicate, [...predicates])
        : undefined,
    confidence: (tiers) =>
      tiers.length > 0 ? inArray(edges.confidence, [...tiers]) : undefined,
    entityId: (id) =>
      id === null ? undefined : or(eq(edges.fromId, id), eq(edges.toId, id)),
  },
  selectiveEither: { entityId: [edges.fromId, edges.toId] },
  sorts: { predicate: edges.predicate, updated: edges.updatedAt },
  searchLabels: { predicate: edges.predicate, confidence: edges.confidence },
  search: { notes: edges.notes },
});

/** A row of the Connection list: the Connection, both ends' labels, and its cursor value. */
export type EdgeListPageRow = Awaited<
  ReturnType<typeof edgeListRepo.page>
>[number];
