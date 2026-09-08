import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";

import type { IdentifierType } from "@watchdog/schemas";
import {
  CONFIDENCE_TIER_LABELS,
  CONFIDENCE_TIERS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPE_LABELS,
  IDENTIFIER_TYPES,
  identifierPlatformSlugsMatchingSearch,
  normalizeUuidList,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { identifiers } from "../schema/identifiers";
import { entityRowInCase } from "./_entity-in-case";
import { entitySlugIlikePatterns } from "./_ilike";
import { inArrayForDisplayLabelMatch } from "./_label-search";
import { clampSearchLimit } from "./_limits";
import { trimCaseId, trimResourceId, trimScopedCaseIds } from "./_scoped-ids";

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
  entitySummary: string | null;
  entityNotes: string | null;
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

function identifierValueForWrite(value: string): string | undefined {
  return trimmedOrUndefined(value);
}

function identifierPlatformForWrite(platform: string): string {
  return trimmedOrUndefined(platform) ?? "";
}

function identifierPatchForWrite(
  patch: IdentifierPatch
): IdentifierPatch | null {
  const next: IdentifierPatch = { ...patch };
  if (patch.value !== undefined) {
    const value = identifierValueForWrite(patch.value);
    if (value === undefined) return null;
    next.value = value;
  }
  if (patch.platform !== undefined) {
    next.platform = identifierPlatformForWrite(patch.platform);
  }
  if (patch.notes !== undefined) {
    next.notes = trimmedOrNull(patch.notes);
  }
  return next;
}

export const identifiersRepo = {
  async listForEntity(
    exec: DbExec,
    entityId: string
  ): Promise<IdentifierRow[]> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return [];
    return exec
      .select(identifierColumns)
      .from(identifiers)
      .where(eq(identifiers.entityId, scopedEntityId))
      .orderBy(asc(identifiers.type), asc(identifiers.value));
  },

  /** All identifiers whose owning entity belongs to the Case. */
  async listForCase(
    exec: DbExec,
    caseId: string
  ): Promise<IdentifierListRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
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
      .where(eq(entities.caseId, scopedCaseId))
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
    caseId: string,
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
    caseId: string,
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
    if (scopedEntityId === undefined) return null;
    const value = identifierValueForWrite(values.value);
    if (value === undefined) return null;
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
        value,
        platform: identifierPlatformForWrite(values.platform ?? ""),
        notes:
          values.notes === undefined
            ? values.notes
            : trimmedOrNull(values.notes),
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
    const normalizedPatch = identifierPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(identifiers)
      .set(normalizedPatch)
      .where(eq(identifiers.id, scopedIdentifierId))
      .returning(identifierColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    identifierId: string,
    patch: IdentifierPatch
  ): Promise<IdentifierRow | null> {
    const scoped = trimScopedCaseIds(caseId, identifierId);
    if (!scoped) return null;
    const normalizedPatch = identifierPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(identifiers)
      .set(normalizedPatch)
      .where(
        and(
          eq(identifiers.id, scoped.resourceId),
          entityRowInCase(identifiers.entityId, scoped.caseId)
        )
      )
      .returning(identifierColumns);
    return updated ?? null;
  },

  /** Delete an identifier only when its owning entity is in the Case. */
  async deleteInCase(
    exec: DbExec,
    caseId: string,
    identifierId: string
  ): Promise<boolean> {
    const scoped = trimScopedCaseIds(caseId, identifierId);
    if (!scoped) return false;
    const deleted = await exec
      .delete(identifiers)
      .where(
        and(
          eq(identifiers.id, scoped.resourceId),
          entityRowInCase(identifiers.entityId, scoped.caseId)
        )
      )
      .returning({ id: identifiers.id });
    return deleted.length > 0;
  },
};
