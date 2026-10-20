import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";

import {
  type CaseId,
  type IdentifierType,
  CONFIDENCE_TIER_LABELS,
  CONFIDENCE_TIERS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPE_LABELS,
  IDENTIFIER_TYPES,
  identifierPlatformSlugsMatchingSearch,
  normalizeUuidList,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { identifiers } from "../schema/identifiers";
import { entityRowInCase } from "./_entity-in-case";
import { entitySlugIlikePatterns } from "./_ilike";
import { keysetAfter } from "./_keyset";
import type { KeysetAfter } from "./_keyset";
import { inArrayForDisplayLabelMatch } from "./_label-search";
import { clampSearchLimit } from "./_limits";
import { trimCaseId, trimResourceId, trimScopedCaseIds } from "./_scoped-ids";
import { atVersion, setOrTouch } from "./_version";

export const identifierColumns = {
  id: identifiers.id,
  entityId: identifiers.entityId,
  type: identifiers.type,
  platform: identifiers.platform,
  value: identifiers.value,
  confidence: identifiers.confidence,
  status: identifiers.status,
  notes: identifiers.notes,
  createdAt: identifiers.createdAt,
  updatedAt: identifiers.updatedAt,
  createdBy: identifiers.createdBy,
  updatedBy: identifiers.updatedBy,
  version: identifiers.version,
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
  entitySummary: string | null;
  entityNotes: string | null;
};

export type NewIdentifier = Pick<
  typeof identifiers.$inferInsert,
  | "entityId"
  | "caseId"
  | "type"
  | "platform"
  | "value"
  | "confidence"
  | "status"
  | "notes"
> &
  Partial<Pick<typeof identifiers.$inferInsert, "id">>;

export type IdentifierPatch = Partial<
  Pick<
    typeof identifiers.$inferInsert,
    "type" | "platform" | "value" | "confidence" | "status" | "notes"
  >
>;

export type IdentifierNaturalKey = {
  entityId: string;
  type: IdentifierType;
  platform: string;
  value: string;
};

export const identifiersRepo = {
  async listForEntity(
    exec: DbExec,
    entityId: string,
    page?: { limit: number; after?: KeysetAfter }
  ): Promise<IdentifierRow[]> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return [];
    const query = exec
      .select(identifierColumns)
      .from(identifiers)
      .where(
        and(
          eq(identifiers.entityId, scopedEntityId),
          keysetAfter({
            idColumn: identifiers.id,
            keys: [{ column: identifiers.type }, { column: identifiers.value }],
            direction: "asc",
            after: page?.after,
          })
        )
      )
      .orderBy(
        asc(identifiers.type),
        asc(identifiers.value),
        asc(identifiers.id)
      );
    return page === undefined ? query : query.limit(page.limit);
  },

  /** All identifiers whose owning entity belongs to the Case. */
  async listForCase(
    exec: DbExec,
    caseId: CaseId,
    page?: { limit: number; after?: KeysetAfter }
  ): Promise<IdentifierListRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const query = exec
      .select({
        ...identifierColumns,
        entityName: entities.name,
        entitySlug: entities.slug,
        entityKind: entities.kind,
        entitySummary: entities.summary,
        entityNotes: entities.notes,
      })
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(
        and(
          eq(entities.caseId, scopedCaseId),
          keysetAfter({
            idColumn: identifiers.id,
            keys: [
              { column: entities.name },
              { column: identifiers.type },
              { column: identifiers.value },
            ],
            direction: "asc",
            after: page?.after,
          })
        )
      )
      .orderBy(
        asc(entities.name),
        asc(identifiers.type),
        asc(identifiers.value),
        asc(identifiers.id)
      );
    return page === undefined ? query : query.limit(page.limit);
  },

  async searchForCase(
    exec: DbExec,
    caseId: CaseId,
    term: string,
    limit: number
  ): Promise<IdentifierListRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const entitySlugMatches = slugPatterns.map((p) => ilike(entities.slug, p));
    const typeLabelMatch = inArrayForDisplayLabelMatch(
      identifiers.type,
      IDENTIFIER_TYPES,
      IDENTIFIER_TYPE_LABELS,
      term
    );
    const statusLabelMatch = inArrayForDisplayLabelMatch(
      identifiers.status,
      IDENTIFIER_STATUSES,
      IDENTIFIER_STATUS_LABELS,
      term
    );
    const confidenceLabelMatch = inArrayForDisplayLabelMatch(
      identifiers.confidence,
      CONFIDENCE_TIERS,
      CONFIDENCE_TIER_LABELS,
      term
    );
    const platformSlugs = identifierPlatformSlugsMatchingSearch(term);
    const platformSlugMatch =
      platformSlugs.length > 0
        ? inArray(identifiers.platform, platformSlugs)
        : undefined;
    return exec
      .select({
        ...identifierColumns,
        entityName: entities.name,
        entitySlug: entities.slug,
        entityKind: entities.kind,
        entitySummary: entities.summary,
        entityNotes: entities.notes,
      })
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(
        and(
          eq(entities.caseId, scopedCaseId),
          or(
            ilike(identifiers.value, pattern),
            ilike(identifiers.platform, pattern),
            ...(platformSlugMatch ? [platformSlugMatch] : []),
            ilike(identifiers.type, pattern),
            ilike(identifiers.notes, pattern),
            ilike(identifiers.status, pattern),
            ilike(identifiers.confidence, pattern),
            ...(typeLabelMatch ? [typeLabelMatch] : []),
            ...(statusLabelMatch ? [statusLabelMatch] : []),
            ...(confidenceLabelMatch ? [confidenceLabelMatch] : []),
            ilike(entities.name, pattern),
            ...entitySlugMatches,
            ilike(entities.summary, pattern),
            ilike(entities.notes, pattern)
          )
        )
      )
      .orderBy(asc(identifiers.value))
      .limit(safeLimit);
  },

  async getInCase(
    exec: DbExec,
    caseId: CaseId,
    identifierId: string
  ): Promise<IdentifierRow | null> {
    const scoped = trimScopedCaseIds(caseId, identifierId);
    if (!scoped) return null;
    const [row] = await exec
      .select(identifierColumns)
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .where(
        and(
          eq(identifiers.id, scoped.resourceId),
          eq(entities.caseId, scoped.caseId)
        )
      )
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
    caseId: CaseId,
    entityIds: string[]
  ): Promise<IdentifierNaturalKey[]> {
    const scopedCaseId = trimCaseId(caseId);
    const normalized = normalizeUuidList(entityIds);
    if (scopedCaseId === undefined || normalized.length === 0) return [];
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
          eq(entities.caseId, scopedCaseId),
          inArray(identifiers.entityId, normalized)
        )
      );
  },

  async create(
    exec: DbExec,
    values: NewIdentifier
  ): Promise<IdentifierRow | null> {
    const scopedEntityId = trimResourceId(values.entityId);
    const scopedCaseId = trimCaseId(values.caseId);
    if (scopedEntityId === undefined || scopedCaseId === undefined) return null;
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const [created] = await exec
      .insert(identifiers)
      .values({
        ...values,
        id,
        entityId: scopedEntityId,
        caseId: scopedCaseId,
      })
      .returning(identifierColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    identifierId: string,
    patch: IdentifierPatch
  ): Promise<IdentifierRow | null> {
    const scopedIdentifierId = trimResourceId(identifierId);
    if (scopedIdentifierId === undefined) return null;
    const [updated] = await exec
      .update(identifiers)
      .set(patch)
      .where(eq(identifiers.id, scopedIdentifierId))
      .returning(identifierColumns);
    return updated ?? null;
  },

  /**
   * Take the row's lock only if it is still at `expectedVersion` (`SELECT … WHERE id AND version
   * FOR UPDATE`, #307): the atomic version check for an edit that also rewrites the row's Evidence
   * links, whose trigger touch would bump the version before a later UPDATE could check it. The
   * lock holds until the transaction ends, so nothing changes the row between check and write.
   * `false` when the row is missing or at another version.
   */
  async lockAtVersionInCase(
    exec: DbExec,
    caseId: CaseId,
    identifierId: string,
    expectedVersion: number
  ): Promise<boolean> {
    const scoped = trimScopedCaseIds(caseId, identifierId);
    if (!scoped) return false;
    const rows = await exec
      .select({ id: identifiers.id })
      .from(identifiers)
      .where(
        and(
          eq(identifiers.id, scoped.resourceId),
          entityRowInCase(identifiers.entityId, scoped.caseId),
          eq(identifiers.version, expectedVersion)
        )
      )
      .for("update");
    return rows.length > 0;
  },

  async updateInCase(
    exec: DbExec,
    caseId: CaseId,
    identifierId: string,
    patch: IdentifierPatch,
    expectedVersion?: number
  ): Promise<IdentifierRow | null> {
    const scoped = trimScopedCaseIds(caseId, identifierId);
    if (!scoped) return null;
    const [updated] = await exec
      .update(identifiers)
      .set(setOrTouch(patch, scoped.resourceId))
      .where(
        and(
          eq(identifiers.id, scoped.resourceId),
          entityRowInCase(identifiers.entityId, scoped.caseId),
          atVersion(identifiers.version, expectedVersion)
        )
      )
      .returning(identifierColumns);
    return updated ?? null;
  },

  /** Delete an identifier only when its owning entity is in the Case; returns the deleted row. */
  async deleteInCase(
    exec: DbExec,
    caseId: CaseId,
    identifierId: string
  ): Promise<IdentifierRow | null> {
    const scoped = trimScopedCaseIds(caseId, identifierId);
    if (!scoped) return null;
    const [deleted] = await exec
      .delete(identifiers)
      .where(
        and(
          eq(identifiers.id, scoped.resourceId),
          entityRowInCase(identifiers.entityId, scoped.caseId)
        )
      )
      .returning(identifierColumns);
    return deleted ?? null;
  },
};
