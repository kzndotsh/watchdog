import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import {
  ENTITY_KIND_LABELS,
  ENTITY_KINDS,
  normalizeUuidList,
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { cases } from "../schema/cases";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { entitySlugIlikePatterns } from "./_ilike";
import {
  inArrayForDisplayLabelMatch,
  sqlInDisplayLabelMatch,
} from "./_label-search";
import { clampSearchLimit } from "./_limits";
import { trimCaseId, trimResourceId, trimScopedCaseIds } from "./_scoped-ids";

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

function entityNameForWrite(name: string): string | undefined {
  return trimmedOrUndefined(name);
}

function entitySlugForWrite(slug: string): string | undefined {
  const normalized = slugifyName(slug);
  return normalized === "" ? undefined : normalized;
}

function entityPatchForWrite(patch: EntityPatch): EntityPatch | null {
  const next: EntityPatch = { ...patch };
  if (patch.name !== undefined) {
    const name = entityNameForWrite(patch.name);
    if (name === undefined) return null;
    next.name = name;
  }
  if (patch.summary !== undefined) {
    next.summary = trimmedOrNull(patch.summary);
  }
  if (patch.notes !== undefined) {
    next.notes = trimmedOrNull(patch.notes);
  }
  return next;
}

export const entitiesRepo = {
  async listForCase(exec: DbExec, caseId: string): Promise<EntityRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select(entityColumns)
      .from(entities)
      .where(eq(entities.caseId, scopedCaseId))
      .orderBy(asc(entities.name));
  },

  async searchForCase(
    exec: DbExec,
    caseId: string,
    term: string,
    limit: number
  ): Promise<EntityRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const entitySlugMatches = slugPatterns.map((p) => ilike(entities.slug, p));
    const kindLabelMatch = inArrayForDisplayLabelMatch(
      entities.kind,
      ENTITY_KINDS,
      ENTITY_KIND_LABELS,
      term
    );
    const peerKindLabelMatch = sqlInDisplayLabelMatch(
      "peer.kind",
      ENTITY_KINDS,
      ENTITY_KIND_LABELS,
      term
    );
    const peerFieldMatches = [
      sql`peer.name ilike ${pattern}`,
      sql`peer.slug ilike ${pattern}`,
      ...slugPatterns.slice(1).map((p) => sql`peer.slug ilike ${p}`),
      sql`peer.summary ilike ${pattern}`,
      sql`peer.notes ilike ${pattern}`,
      sql`peer.kind::text ilike ${pattern}`,
      ...(peerKindLabelMatch ? [peerKindLabelMatch] : []),
      sql`e.notes ilike ${pattern}`,
    ];
    return exec
      .select(entityColumns)
      .from(entities)
      .where(
        and(
          eq(entities.caseId, scopedCaseId),
          or(
            ilike(entities.name, pattern),
            ...entitySlugMatches,
            ilike(entities.summary, pattern),
            ilike(entities.notes, pattern),
            ilike(entities.kind, pattern),
            ...(kindLabelMatch ? [kindLabelMatch] : []),
            sql`exists (
              select 1 from ${edges} e
              inner join ${entities} peer on peer.id = case
                when e.from_id = ${entities.id} then e.to_id
                else e.from_id
              end
              where (e.from_id = ${entities.id} or e.to_id = ${entities.id})
                and peer.case_id = ${scopedCaseId}
                and (${sql.join(peerFieldMatches, sql` or `)})
            )`
          )
        )
      )
      .orderBy(asc(entities.name))
      .limit(safeLimit);
  },

  async listPeersForCase(
    exec: DbExec,
    caseId: string
  ): Promise<EntityPeerRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select({
        id: entities.id,
        name: entities.name,
        slug: entities.slug,
      })
      .from(entities)
      .where(eq(entities.caseId, scopedCaseId));
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    entityId: string
  ): Promise<EntityRow | null> {
    const scoped = trimScopedCaseIds(caseId, entityId);
    if (!scoped) return null;
    const [row] = await exec
      .select(entityColumns)
      .from(entities)
      .where(
        and(
          eq(entities.id, scoped.resourceId),
          eq(entities.caseId, scoped.caseId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async getById(exec: DbExec, entityId: string): Promise<EntityRow | null> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return null;
    const [row] = await exec
      .select(entityColumns)
      .from(entities)
      .where(eq(entities.id, scopedEntityId))
      .limit(1);
    return row ?? null;
  },

  async getWithCase(
    exec: DbExec,
    entityId: string
  ): Promise<EntityWithCaseRow | null> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return null;
    const [row] = await exec
      .select({
        ...entityColumns,
        caseSlug: cases.slug,
        caseName: cases.name,
      })
      .from(entities)
      .innerJoin(cases, eq(cases.id, entities.caseId))
      .where(eq(entities.id, scopedEntityId))
      .limit(1);
    return row ?? null;
  },

  async getByCaseSlug(
    exec: DbExec,
    caseId: string,
    slug: string
  ): Promise<EntityRow | null> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedSlug = entitySlugForWrite(slug);
    if (scopedCaseId === undefined || scopedSlug === undefined) return null;
    const [row] = await exec
      .select(entityColumns)
      .from(entities)
      .where(
        and(eq(entities.caseId, scopedCaseId), eq(entities.slug, scopedSlug))
      )
      .limit(1);
    return row ?? null;
  },

  async listSlugsInCase(
    exec: DbExec,
    caseId: string,
    slugs: string[]
  ): Promise<{ slug: string }[]> {
    const scopedCaseId = trimCaseId(caseId);
    const normalized = [
      ...new Set(
        slugs
          .map((slug) => entitySlugForWrite(slug))
          .filter((slug): slug is string => slug !== undefined)
      ),
    ];
    if (scopedCaseId === undefined || normalized.length === 0) return [];
    return exec
      .select({ slug: entities.slug })
      .from(entities)
      .where(
        and(
          eq(entities.caseId, scopedCaseId),
          inArray(entities.slug, normalized)
        )
      );
  },

  async listNamesByIdsInCase(
    exec: DbExec,
    caseId: string,
    entityIds: string[]
  ): Promise<
    {
      id: string;
      name: string;
      slug: string;
      summary: string | null;
      notes: string | null;
    }[]
  > {
    const scopedCaseId = trimCaseId(caseId);
    const normalized = normalizeUuidList(entityIds);
    if (scopedCaseId === undefined || normalized.length === 0) return [];
    return exec
      .select({
        id: entities.id,
        name: entities.name,
        slug: entities.slug,
        summary: entities.summary,
        notes: entities.notes,
      })
      .from(entities)
      .where(
        and(eq(entities.caseId, scopedCaseId), inArray(entities.id, normalized))
      );
  },

  async create(exec: DbExec, values: NewEntity): Promise<EntityRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    if (scopedCaseId === undefined) return null;
    const name = entityNameForWrite(values.name);
    const slug = entitySlugForWrite(values.slug);
    if (name === undefined || slug === undefined) return null;
    const summary =
      values.summary === undefined ? undefined : trimmedOrNull(values.summary);
    const notes =
      values.notes === undefined ? undefined : trimmedOrNull(values.notes);
    const [created] = await exec
      .insert(entities)
      .values({
        ...values,
        caseId: scopedCaseId,
        name,
        slug,
        ...(summary === undefined ? {} : { summary }),
        ...(notes === undefined ? {} : { notes }),
      })
      .returning(entityColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    entityId: string,
    patch: EntityPatch
  ): Promise<EntityRow | null> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return null;
    const normalizedPatch = entityPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(entities)
      .set(normalizedPatch)
      .where(eq(entities.id, scopedEntityId))
      .returning(entityColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    entityId: string,
    patch: EntityPatch
  ): Promise<EntityRow | null> {
    const scoped = trimScopedCaseIds(caseId, entityId);
    if (!scoped) return null;
    const normalizedPatch = entityPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(entities)
      .set(normalizedPatch)
      .where(
        and(
          eq(entities.id, scoped.resourceId),
          eq(entities.caseId, scoped.caseId)
        )
      )
      .returning(entityColumns);
    return updated ?? null;
  },

  async delete(exec: DbExec, entityId: string): Promise<boolean> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return false;
    const deleted = await exec
      .delete(entities)
      .where(eq(entities.id, scopedEntityId))
      .returning({ id: entities.id });
    return deleted.length > 0;
  },

  async deleteInCase(
    exec: DbExec,
    caseId: string,
    entityId: string
  ): Promise<boolean> {
    const scoped = trimScopedCaseIds(caseId, entityId);
    if (!scoped) return false;
    const deleted = await exec
      .delete(entities)
      .where(
        and(
          eq(entities.id, scoped.resourceId),
          eq(entities.caseId, scoped.caseId)
        )
      )
      .returning({ id: entities.id });
    return deleted.length > 0;
  },
};
