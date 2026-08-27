import { and, asc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { EdgePredicate } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";

export const edgeColumns = {
  id: edges.id,
  fromId: edges.fromId,
  toId: edges.toId,
  predicate: edges.predicate,
  confidence: edges.confidence,
  notes: edges.notes,
} as const;

export type EdgeRow = {
  [K in keyof typeof edgeColumns]: (typeof edges.$inferSelect)[K &
    keyof typeof edges.$inferSelect];
};

/** Edge row plus endpoint entity labels (for dossier peer display). */
export type EdgeListRow = EdgeRow & {
  fromName: string;
  fromSlug: string;
  fromKind: (typeof entities.$inferSelect)["kind"];
  toName: string;
  toSlug: string;
  toKind: (typeof entities.$inferSelect)["kind"];
};

export type NewEdge = Pick<
  typeof edges.$inferInsert,
  "fromId" | "toId" | "predicate" | "confidence" | "notes"
> &
  Partial<Pick<typeof edges.$inferInsert, "id">>;

export type EdgePatch = Partial<
  Pick<
    typeof edges.$inferInsert,
    "confidence" | "notes" | "predicate" | "fromId" | "toId"
  >
>;

export interface EdgeNaturalKey {
  fromId: string;
  toId: string;
  predicate: EdgePredicate;
}

async function listWithEndpoints(
  exec: DbExec,
  caseId: string,
  entityId?: string
): Promise<EdgeListRow[]> {
  const fromEntity = alias(entities, "from_entity");
  const toEntity = alias(entities, "to_entity");
  const caseScope = and(
    eq(fromEntity.caseId, caseId),
    eq(toEntity.caseId, caseId)
  );
  const where =
    entityId === undefined
      ? caseScope
      : and(
          or(eq(edges.fromId, entityId), eq(edges.toId, entityId)),
          caseScope
        );

  return await exec
    .select({
      ...edgeColumns,
      fromName: fromEntity.name,
      fromSlug: fromEntity.slug,
      fromKind: fromEntity.kind,
      toName: toEntity.name,
      toSlug: toEntity.slug,
      toKind: toEntity.kind,
    })
    .from(edges)
    .innerJoin(fromEntity, eq(edges.fromId, fromEntity.id))
    .innerJoin(toEntity, eq(edges.toId, toEntity.id))
    .where(where)
    .orderBy(asc(edges.predicate));
}

export const edgesRepo = {
  async listForEntity(
    exec: DbExec,
    caseId: string,
    entityId: string
  ): Promise<EdgeListRow[]> {
    return listWithEndpoints(exec, caseId, entityId);
  },

  /** All edges whose both endpoints belong to the Case. */
  async listForCase(exec: DbExec, caseId: string): Promise<EdgeListRow[]> {
    return listWithEndpoints(exec, caseId);
  },

  /** Outbound edges only (export Connections section). */
  async listOutboundForEntity(
    exec: DbExec,
    entityId: string
  ): Promise<EdgeRow[]> {
    return exec
      .select(edgeColumns)
      .from(edges)
      .where(eq(edges.fromId, entityId));
  },

  async getListedInCase(
    exec: DbExec,
    caseId: string,
    edgeId: string
  ): Promise<EdgeListRow | null> {
    const fromEntity = alias(entities, "from_entity");
    const toEntity = alias(entities, "to_entity");

    const [row] = await exec
      .select({
        ...edgeColumns,
        fromName: fromEntity.name,
        fromSlug: fromEntity.slug,
        fromKind: fromEntity.kind,
        toName: toEntity.name,
        toSlug: toEntity.slug,
        toKind: toEntity.kind,
      })
      .from(edges)
      .innerJoin(fromEntity, eq(edges.fromId, fromEntity.id))
      .innerJoin(toEntity, eq(edges.toId, toEntity.id))
      .where(
        and(
          eq(edges.id, edgeId),
          eq(fromEntity.caseId, caseId),
          eq(toEntity.caseId, caseId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    edgeId: string
  ): Promise<EdgeRow | null> {
    const fromEntity = alias(entities, "from_entity");
    const [row] = await exec
      .select(edgeColumns)
      .from(edges)
      .innerJoin(fromEntity, eq(edges.fromId, fromEntity.id))
      .where(and(eq(edges.id, edgeId), eq(fromEntity.caseId, caseId)))
      .limit(1);
    return row ?? null;
  },

  async findByNaturalKey(
    exec: DbExec,
    key: EdgeNaturalKey
  ): Promise<{ id: string } | null> {
    const [row] = await exec
      .select({ id: edges.id })
      .from(edges)
      .where(
        and(
          eq(edges.fromId, key.fromId),
          eq(edges.toId, key.toId),
          eq(edges.predicate, key.predicate)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /** Natural keys for FP suppress — scoped to case + from ids. */
  async listNaturalKeysInCase(
    exec: DbExec,
    caseId: string,
    fromIds: string[]
  ): Promise<EdgeNaturalKey[]> {
    if (fromIds.length === 0) return [];
    return exec
      .select({
        fromId: edges.fromId,
        toId: edges.toId,
        predicate: edges.predicate,
      })
      .from(edges)
      .innerJoin(entities, eq(edges.fromId, entities.id))
      .where(and(eq(entities.caseId, caseId), inArray(edges.fromId, fromIds)));
  },

  async create(exec: DbExec, values: NewEdge): Promise<EdgeRow | null> {
    const [created] = await exec
      .insert(edges)
      .values(values)
      .returning(edgeColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    edgeId: string,
    patch: EdgePatch
  ): Promise<EdgeRow | null> {
    const [updated] = await exec
      .update(edges)
      .set(patch)
      .where(eq(edges.id, edgeId))
      .returning(edgeColumns);
    return updated ?? null;
  },

  async delete(exec: DbExec, edgeId: string): Promise<boolean> {
    const deleted = await exec
      .delete(edges)
      .where(eq(edges.id, edgeId))
      .returning({ id: edges.id });
    return deleted.length > 0;
  },
};
