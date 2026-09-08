import { and, asc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { EdgePredicate } from "@watchdog/schemas";
import { normalizeUuidList, trimmedOrNull } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { edgeRowInCase } from "./_entity-in-case";
import { trimCaseId, trimResourceId, trimScopedCaseIds } from "./_scoped-ids";

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
  notes?: string | null;
}

function edgeNotesForWrite(
  notes: string | null | undefined
): string | null | undefined {
  if (notes === undefined) return undefined;
  return trimmedOrNull(notes);
}

function edgePatchForWrite(patch: EdgePatch): EdgePatch | null {
  const next: EdgePatch = { ...patch };
  if (patch.notes !== undefined) {
    next.notes = edgeNotesForWrite(patch.notes) ?? null;
  }
  if (patch.fromId !== undefined) {
    const fromId = trimResourceId(patch.fromId);
    if (fromId === undefined) return null;
    next.fromId = fromId;
  }
  if (patch.toId !== undefined) {
    const toId = trimResourceId(patch.toId);
    if (toId === undefined) return null;
    next.toId = toId;
  }
  return next;
}

async function listWithEndpoints(
  exec: DbExec,
  caseId: string,
  entityId?: string
): Promise<EdgeListRow[]> {
  const scopedCaseId = trimCaseId(caseId);
  if (scopedCaseId === undefined) return [];
  const scopedEntityId =
    entityId === undefined ? undefined : trimResourceId(entityId);
  if (entityId !== undefined && scopedEntityId === undefined) return [];
  const fromEntity = alias(entities, "from_entity");
  const toEntity = alias(entities, "to_entity");
  const caseScope = and(
    eq(fromEntity.caseId, scopedCaseId),
    eq(toEntity.caseId, scopedCaseId)
  );
  const where =
    scopedEntityId === undefined
      ? caseScope
      : and(
          or(eq(edges.fromId, scopedEntityId), eq(edges.toId, scopedEntityId)),
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
    caseId: string,
    entityId: string
  ): Promise<EdgeRow[]> {
    const scoped = trimScopedCaseIds(caseId, entityId);
    if (!scoped) return [];
    const fromEntity = alias(entities, "from_entity");
    const toEntity = alias(entities, "to_entity");
    return exec
      .select(edgeColumns)
      .from(edges)
      .innerJoin(fromEntity, eq(edges.fromId, fromEntity.id))
      .innerJoin(toEntity, eq(edges.toId, toEntity.id))
      .where(
        and(
          eq(edges.fromId, scoped.resourceId),
          eq(fromEntity.caseId, scoped.caseId),
          eq(toEntity.caseId, scoped.caseId)
        )
      );
  },

  async getListedInCase(
    exec: DbExec,
    caseId: string,
    edgeId: string
  ): Promise<EdgeListRow | null> {
    const scoped = trimScopedCaseIds(caseId, edgeId);
    if (!scoped) return null;
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
          eq(edges.id, scoped.resourceId),
          eq(fromEntity.caseId, scoped.caseId),
          eq(toEntity.caseId, scoped.caseId)
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
    const scoped = trimScopedCaseIds(caseId, edgeId);
    if (!scoped) return null;
    const fromEntity = alias(entities, "from_entity");
    const toEntity = alias(entities, "to_entity");
    const [row] = await exec
      .select(edgeColumns)
      .from(edges)
      .innerJoin(fromEntity, eq(edges.fromId, fromEntity.id))
      .innerJoin(toEntity, eq(edges.toId, toEntity.id))
      .where(
        and(
          eq(edges.id, scoped.resourceId),
          eq(fromEntity.caseId, scoped.caseId),
          eq(toEntity.caseId, scoped.caseId)
        )
      )
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

  /** Natural keys for FP suppress — scoped to case + endpoint entity ids. */
  async listNaturalKeysInCase(
    exec: DbExec,
    caseId: string,
    entityIds: string[]
  ): Promise<EdgeNaturalKey[]> {
    const scopedCaseId = trimCaseId(caseId);
    const normalized = normalizeUuidList(entityIds);
    if (scopedCaseId === undefined || normalized.length === 0) return [];
    const fromEntity = alias(entities, "from_entity");
    const toEntity = alias(entities, "to_entity");
    return exec
      .select({
        fromId: edges.fromId,
        toId: edges.toId,
        predicate: edges.predicate,
        notes: edges.notes,
      })
      .from(edges)
      .innerJoin(fromEntity, eq(edges.fromId, fromEntity.id))
      .innerJoin(toEntity, eq(edges.toId, toEntity.id))
      .where(
        and(
          eq(fromEntity.caseId, scopedCaseId),
          eq(toEntity.caseId, scopedCaseId),
          or(inArray(edges.fromId, normalized), inArray(edges.toId, normalized))
        )
      );
  },

  async create(exec: DbExec, values: NewEdge): Promise<EdgeRow | null> {
    const fromId = trimResourceId(values.fromId);
    const toId = trimResourceId(values.toId);
    if (fromId === undefined || toId === undefined) return null;
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const notes = edgeNotesForWrite(values.notes);
    const [created] = await exec
      .insert(edges)
      .values({
        ...values,
        id,
        fromId,
        toId,
        ...(notes === undefined ? {} : { notes }),
      })
      .returning(edgeColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    edgeId: string,
    patch: EdgePatch
  ): Promise<EdgeRow | null> {
    const scopedEdgeId = trimResourceId(edgeId);
    if (scopedEdgeId === undefined) return null;
    const normalizedPatch = edgePatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(edges)
      .set(normalizedPatch)
      .where(eq(edges.id, scopedEdgeId))
      .returning(edgeColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    edgeId: string,
    patch: EdgePatch
  ): Promise<EdgeRow | null> {
    const scoped = trimScopedCaseIds(caseId, edgeId);
    if (!scoped) return null;
    const normalizedPatch = edgePatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(edges)
      .set(normalizedPatch)
      .where(
        and(
          eq(edges.id, scoped.resourceId),
          edgeRowInCase(edges.id, scoped.caseId)
        )
      )
      .returning(edgeColumns);
    return updated ?? null;
  },

  async delete(exec: DbExec, edgeId: string): Promise<boolean> {
    const scopedEdgeId = trimResourceId(edgeId);
    if (scopedEdgeId === undefined) return false;
    const deleted = await exec
      .delete(edges)
      .where(eq(edges.id, scopedEdgeId))
      .returning({ id: edges.id });
    return deleted.length > 0;
  },

  async deleteInCase(
    exec: DbExec,
    caseId: string,
    edgeId: string
  ): Promise<boolean> {
    const scoped = trimScopedCaseIds(caseId, edgeId);
    if (!scoped) return false;
    const deleted = await exec
      .delete(edges)
      .where(
        and(
          eq(edges.id, scoped.resourceId),
          edgeRowInCase(edges.id, scoped.caseId)
        )
      )
      .returning({ id: edges.id });
    return deleted.length > 0;
  },
};
