import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";

import type { DbExec } from "../exec";
import { cases } from "../schema/cases";
import { entities } from "../schema/entities";
import { containsPattern } from "./_ilike";

export const entityColumns = {
  id: entities.id,
  caseId: entities.caseId,
  kind: entities.kind,
  name: entities.name,
  slug: entities.slug,
  summary: entities.summary,
  notes: entities.notes,
  createdAt: entities.createdAt,
  updatedAt: entities.updatedAt,
} as const;

export type EntityRow = {
  [K in keyof typeof entityColumns]: (typeof entities.$inferSelect)[K &
    keyof typeof entities.$inferSelect];
};

export interface EntityPeerRow {
  id: string;
  name: string;
  slug: string;
}

export type EntityWithCaseRow = EntityRow & {
  caseSlug: string;
  caseName: string;
};

export type NewEntity = Pick<
  typeof entities.$inferInsert,
  "caseId" | "kind" | "name" | "slug"
> &
  Partial<Pick<typeof entities.$inferInsert, "id" | "summary" | "notes">>;

export type EntityPatch = Partial<
  Pick<typeof entities.$inferInsert, "kind" | "name" | "summary" | "notes">
>;

export const entitiesRepo = {
  async listForCase(exec: DbExec, caseId: string): Promise<EntityRow[]> {
    return exec
      .select(entityColumns)
      .from(entities)
      .where(eq(entities.caseId, caseId))
      .orderBy(asc(entities.name));
  },

  async searchForCase(
    exec: DbExec,
    caseId: string,
    term: string,
    limit: number
  ): Promise<EntityRow[]> {
    const pattern = containsPattern(term);
    if (pattern === null) return [];
    return exec
      .select(entityColumns)
      .from(entities)
      .where(
        and(
          eq(entities.caseId, caseId),
          or(
            ilike(entities.name, pattern),
            ilike(entities.slug, pattern),
            ilike(entities.summary, pattern)
          )
        )
      )
      .orderBy(asc(entities.name))
      .limit(limit);
  },

  async listPeersForCase(
    exec: DbExec,
    caseId: string
  ): Promise<EntityPeerRow[]> {
    return exec
      .select({
        id: entities.id,
        name: entities.name,
        slug: entities.slug,
      })
      .from(entities)
      .where(eq(entities.caseId, caseId));
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    entityId: string
  ): Promise<EntityRow | null> {
    const [row] = await exec
      .select(entityColumns)
      .from(entities)
      .where(and(eq(entities.id, entityId), eq(entities.caseId, caseId)))
      .limit(1);
    return row ?? null;
  },

  async getById(exec: DbExec, entityId: string): Promise<EntityRow | null> {
    const [row] = await exec
      .select(entityColumns)
      .from(entities)
      .where(eq(entities.id, entityId))
      .limit(1);
    return row ?? null;
  },

  async getWithCase(
    exec: DbExec,
    entityId: string
  ): Promise<EntityWithCaseRow | null> {
    const [row] = await exec
      .select({
        ...entityColumns,
        caseSlug: cases.slug,
        caseName: cases.name,
      })
      .from(entities)
      .innerJoin(cases, eq(cases.id, entities.caseId))
      .where(eq(entities.id, entityId))
      .limit(1);
    return row ?? null;
  },

  async getByCaseSlug(
    exec: DbExec,
    caseId: string,
    slug: string
  ): Promise<EntityRow | null> {
    const [row] = await exec
      .select(entityColumns)
      .from(entities)
      .where(and(eq(entities.caseId, caseId), eq(entities.slug, slug)))
      .limit(1);
    return row ?? null;
  },

  async listSlugsInCase(
    exec: DbExec,
    caseId: string,
    slugs: string[]
  ): Promise<{ slug: string }[]> {
    if (slugs.length === 0) return [];
    return exec
      .select({ slug: entities.slug })
      .from(entities)
      .where(and(eq(entities.caseId, caseId), inArray(entities.slug, slugs)));
  },

  async listNamesByIds(
    exec: DbExec,
    entityIds: string[]
  ): Promise<{ id: string; name: string; slug: string }[]> {
    if (entityIds.length === 0) return [];
    return exec
      .select({
        id: entities.id,
        name: entities.name,
        slug: entities.slug,
      })
      .from(entities)
      .where(inArray(entities.id, entityIds));
  },

  async create(exec: DbExec, values: NewEntity): Promise<EntityRow | null> {
    const [created] = await exec
      .insert(entities)
      .values(values)
      .returning(entityColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    entityId: string,
    patch: EntityPatch
  ): Promise<EntityRow | null> {
    const [updated] = await exec
      .update(entities)
      .set(patch)
      .where(eq(entities.id, entityId))
      .returning(entityColumns);
    return updated ?? null;
  },

  async delete(exec: DbExec, entityId: string): Promise<boolean> {
    const deleted = await exec
      .delete(entities)
      .where(eq(entities.id, entityId))
      .returning({ id: entities.id });
    return deleted.length > 0;
  },
};
