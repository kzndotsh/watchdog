import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";

import type { IdentifierType } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { identifiers } from "../schema/identifiers";
import { containsPattern } from "./_ilike";

export const identifierColumns = {
  id: identifiers.id,
  entityId: identifiers.entityId,
  type: identifiers.type,
  platform: identifiers.platform,
  value: identifiers.value,
  confidence: identifiers.confidence,
  status: identifiers.status,
  notes: identifiers.notes,
} as const;

export type IdentifierRow = {
  [K in keyof typeof identifierColumns]: (typeof identifiers.$inferSelect)[K &
    keyof typeof identifiers.$inferSelect];
};

/** Identifier row plus owning entity labels (case-wide list). */
export type IdentifierListRow = IdentifierRow & {
  entityName: string;
  entitySlug: string;
  entityKind: (typeof entities.$inferSelect)["kind"];
};

export type NewIdentifier = Pick<
  typeof identifiers.$inferInsert,
  "entityId" | "type" | "platform" | "value" | "confidence" | "status" | "notes"
> &
  Partial<Pick<typeof identifiers.$inferInsert, "id">>;

export type IdentifierPatch = Partial<
  Pick<
    typeof identifiers.$inferInsert,
    "type" | "platform" | "value" | "confidence" | "status" | "notes"
  >
>;

export interface IdentifierNaturalKey {
  entityId: string;
  type: IdentifierType;
  platform: string;
  value: string;
}

export const identifiersRepo = {
  async listForEntity(
    exec: DbExec,
    entityId: string
  ): Promise<IdentifierRow[]> {
    return exec
      .select(identifierColumns)
      .from(identifiers)
      .where(eq(identifiers.entityId, entityId))
      .orderBy(asc(identifiers.type), asc(identifiers.value));
  },

  /** All identifiers whose owning entity belongs to the Case. */
  async listForCase(
    exec: DbExec,
    caseId: string
  ): Promise<IdentifierListRow[]> {
    return exec
      .select({
        ...identifierColumns,
        entityName: entities.name,
        entitySlug: entities.slug,
        entityKind: entities.kind,
      })
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(eq(entities.caseId, caseId))
      .orderBy(
        asc(entities.name),
        asc(identifiers.type),
        asc(identifiers.value)
      );
  },

  async searchForCase(
    exec: DbExec,
    caseId: string,
    term: string,
    limit: number
  ): Promise<IdentifierListRow[]> {
    const pattern = containsPattern(term);
    if (pattern === null) return [];
    return exec
      .select({
        ...identifierColumns,
        entityName: entities.name,
        entitySlug: entities.slug,
        entityKind: entities.kind,
      })
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(
        and(
          eq(entities.caseId, caseId),
          or(
            ilike(identifiers.value, pattern),
            ilike(identifiers.platform, pattern),
            ilike(identifiers.type, pattern)
          )
        )
      )
      .orderBy(asc(identifiers.value))
      .limit(limit);
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    identifierId: string
  ): Promise<IdentifierRow | null> {
    const [row] = await exec
      .select(identifierColumns)
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(and(eq(identifiers.id, identifierId), eq(entities.caseId, caseId)))
      .limit(1);
    return row ?? null;
  },

  async findByNaturalKey(
    exec: DbExec,
    key: IdentifierNaturalKey
  ): Promise<{ id: string } | null> {
    const [row] = await exec
      .select({ id: identifiers.id })
      .from(identifiers)
      .where(
        and(
          eq(identifiers.entityId, key.entityId),
          eq(identifiers.type, key.type),
          eq(identifiers.platform, key.platform),
          eq(identifiers.value, key.value)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /** Natural keys for FP suppress — scoped to case + entity ids. */
  async listNaturalKeysInCase(
    exec: DbExec,
    caseId: string,
    entityIds: string[]
  ): Promise<IdentifierNaturalKey[]> {
    if (entityIds.length === 0) return [];
    return exec
      .select({
        entityId: identifiers.entityId,
        type: identifiers.type,
        platform: identifiers.platform,
        value: identifiers.value,
      })
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(
        and(
          eq(entities.caseId, caseId),
          inArray(identifiers.entityId, entityIds)
        )
      );
  },

  async create(
    exec: DbExec,
    values: NewIdentifier
  ): Promise<IdentifierRow | null> {
    const [created] = await exec
      .insert(identifiers)
      .values(values)
      .returning(identifierColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    identifierId: string,
    patch: IdentifierPatch
  ): Promise<IdentifierRow | null> {
    const [updated] = await exec
      .update(identifiers)
      .set(patch)
      .where(eq(identifiers.id, identifierId))
      .returning(identifierColumns);
    return updated ?? null;
  },

  /** Delete an identifier only when its owning entity is in the Case. */
  async deleteInCase(
    exec: DbExec,
    caseId: string,
    identifierId: string
  ): Promise<boolean> {
    const [owned] = await exec
      .select({ id: identifiers.id })
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(and(eq(identifiers.id, identifierId), eq(entities.caseId, caseId)))
      .limit(1);
    if (!owned) return false;
    const deleted = await exec
      .delete(identifiers)
      .where(eq(identifiers.id, identifierId))
      .returning({ id: identifiers.id });
    return deleted.length > 0;
  },
};
