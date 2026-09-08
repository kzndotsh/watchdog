import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";

import type { EvidenceKind } from "@watchdog/schemas";
import {
  ENTITY_KIND_LABELS,
  ENTITY_KINDS,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  normalizeUuidList,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { evidence } from "../schema/evidence";
import { entitySlugIlikePatterns } from "./_ilike";
import { inArrayForDisplayLabelMatch } from "./_label-search";
import { clampSearchLimit } from "./_limits";
import {
  trimActorId,
  trimCaseId,
  trimScopedCaseIds,
  resolveNullableGraphIdForWrite,
} from "./_scoped-ids";

export const evidenceColumns = {
  id: evidence.id,
  caseId: evidence.caseId,
  entityId: evidence.entityId,
  kind: evidence.kind,
  label: evidence.label,
  notes: evidence.notes,
  mime: evidence.mime,
  uri: evidence.uri,
  sha256: evidence.sha256,
  text: evidence.text,
  sourceUrl: evidence.sourceUrl,
  actorId: evidence.actorId,
  actorLabel: evidence.actorLabel,
  capturedAt: evidence.capturedAt,
  processedAt: evidence.processedAt,
  deletedAt: evidence.deletedAt,
} as const;

export type EvidenceRow = {
  [K in keyof typeof evidenceColumns]: (typeof evidence.$inferSelect)[K &
    keyof typeof evidence.$inferSelect];
};

export type NewEvidence = Pick<
  typeof evidence.$inferInsert,
  | "caseId"
  | "entityId"
  | "kind"
  | "label"
  | "notes"
  | "mime"
  | "uri"
  | "sha256"
  | "text"
  | "sourceUrl"
  | "actorId"
  | "actorLabel"
>;

export interface EvidenceCapSeed {
  id: string;
  entityId: string | null;
  sourceUrl: string | null;
  text: string | null;
}

export interface ListEvidenceRowsOpts {
  /** Include soft-deleted rows alongside active. Default: active only. */
  includeDeleted?: boolean;
  /** Only soft-deleted rows (Hidden queue). Overrides includeDeleted. */
  deletedOnly?: boolean;
  unprocessedOnly?: boolean;
  unattachedOnly?: boolean;
}

function evidenceMetadataForCreate(values: NewEvidence): NewEvidence {
  const label =
    values.label === undefined ? values.label : trimmedOrNull(values.label);
  const notes =
    values.notes === undefined ? values.notes : trimmedOrNull(values.notes);
  const sourceUrl =
    values.sourceUrl === undefined || values.sourceUrl === null
      ? values.sourceUrl
      : (trimmedOrUndefined(values.sourceUrl) ?? null);
  const uri =
    values.uri === undefined || values.uri === null
      ? values.uri
      : (trimmedOrUndefined(values.uri) ?? null);
  const actorLabel =
    values.actorLabel === undefined || values.actorLabel === null
      ? values.actorLabel
      : trimmedOrNull(values.actorLabel);
  return {
    ...values,
    ...(values.label === undefined ? {} : { label }),
    ...(values.notes === undefined ? {} : { notes }),
    ...(values.sourceUrl === undefined ? {} : { sourceUrl }),
    ...(values.uri === undefined ? {} : { uri }),
    ...(values.actorLabel === undefined ? {} : { actorLabel }),
  };
}

function softDeleteFilter(opts?: ListEvidenceRowsOpts) {
  if (opts?.deletedOnly === true) return isNotNull(evidence.deletedAt);
  // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return requires an explicit value alongside the branches above/below
  if (opts?.includeDeleted === true) return undefined;
  return isNull(evidence.deletedAt);
}

export const evidenceRepo = {
  async listForCase(
    exec: DbExec,
    caseId: string,
    opts?: ListEvidenceRowsOpts
  ): Promise<EvidenceRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .where(
        and(
          eq(evidence.caseId, scopedCaseId),
          softDeleteFilter(opts),
          opts?.unprocessedOnly === true
            ? isNull(evidence.processedAt)
            : undefined,
          opts?.unattachedOnly === true ? isNull(evidence.entityId) : undefined
        )
      )
      .orderBy(desc(evidence.capturedAt));
  },

  async searchForCase(
    exec: DbExec,
    caseId: string,
    term: string,
    limit: number
  ): Promise<EvidenceRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const entitySlugMatches = slugPatterns.map((p) => ilike(entities.slug, p));
    const kindLabelMatch = inArrayForDisplayLabelMatch(
      evidence.kind,
      EVIDENCE_KINDS,
      EVIDENCE_KIND_LABELS,
      term
    );
    const entityKindLabelMatch = inArrayForDisplayLabelMatch(
      entities.kind,
      ENTITY_KINDS,
      ENTITY_KIND_LABELS,
      term
    );
    const entityFieldMatch = and(
      eq(entities.caseId, scopedCaseId),
      or(
        ilike(entities.name, pattern),
        ...entitySlugMatches,
        ilike(entities.summary, pattern),
        ilike(entities.notes, pattern),
        ilike(entities.kind, pattern),
        ...(entityKindLabelMatch ? [entityKindLabelMatch] : [])
      )
    );
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .leftJoin(entities, eq(evidence.entityId, entities.id))
      .where(
        and(
          eq(evidence.caseId, scopedCaseId),
          isNull(evidence.deletedAt),
          or(
            ilike(evidence.label, pattern),
            ilike(evidence.notes, pattern),
            ilike(evidence.sourceUrl, pattern),
            ilike(evidence.text, pattern),
            ilike(evidence.sha256, pattern),
            ilike(evidence.mime, pattern),
            ilike(evidence.kind, pattern),
            ...(kindLabelMatch ? [kindLabelMatch] : []),
            entityFieldMatch
          )
        )
      )
      .orderBy(desc(evidence.capturedAt))
      .limit(safeLimit);
  },

  /** Active evidence attached to an entity — export order (oldest first). */
  async listForEntity(
    exec: DbExec,
    caseId: string,
    entityId: string
  ): Promise<EvidenceRow[]> {
    const scoped = trimScopedCaseIds(caseId, entityId);
    if (!scoped) return [];
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .where(
        and(
          eq(evidence.caseId, scoped.caseId),
          eq(evidence.entityId, scoped.resourceId),
          isNull(evidence.deletedAt)
        )
      )
      .orderBy(asc(evidence.capturedAt));
  },

  /** Active (non-deleted) evidence in a case — export order (oldest first). */
  async listActiveForCaseAsc(
    exec: DbExec,
    caseId: string
  ): Promise<EvidenceRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .where(and(eq(evidence.caseId, scopedCaseId), isNull(evidence.deletedAt)))
      .orderBy(asc(evidence.capturedAt));
  },

  async getActiveInCase(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<EvidenceRow | null> {
    const scoped = trimScopedCaseIds(caseId, evidenceId);
    if (scoped === null) return null;
    const [row] = await exec
      .select(evidenceColumns)
      .from(evidence)
      .where(
        and(
          eq(evidence.id, scoped.resourceId),
          eq(evidence.caseId, scoped.caseId),
          isNull(evidence.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async create(exec: DbExec, values: NewEvidence): Promise<EvidenceRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    if (scopedCaseId === undefined) return null;
    const scopedActorId = trimActorId(values.actorId);
    if (scopedActorId === undefined) return null;
    const resolvedEntityId = resolveNullableGraphIdForWrite(values.entityId);
    if (!resolvedEntityId.ok) return null;
    const normalized = evidenceMetadataForCreate({
      ...values,
      actorId: scopedActorId,
      ...(values.entityId === undefined
        ? {}
        : { entityId: resolvedEntityId.id ?? null }),
    });
    const [created] = await exec
      .insert(evidence)
      .values({
        ...normalized,
        caseId: scopedCaseId,
        actorId: scopedActorId,
        ...(values.entityId === undefined
          ? {}
          : { entityId: resolvedEntityId.id ?? null }),
      })
      .returning(evidenceColumns);
    return created ?? null;
  },

  /** Soft-deleted rows included — Hidden dumps must stay downloadable. */
  async getUriInCaseIncludingDeleted(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<{ uri: string | null } | null> {
    const scoped = trimScopedCaseIds(caseId, evidenceId);
    if (scoped === null) return null;
    const [row] = await exec
      .select({ uri: evidence.uri })
      .from(evidence)
      .where(
        and(
          eq(evidence.id, scoped.resourceId),
          eq(evidence.caseId, scoped.caseId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Evidence ids that exist in the Case (active and hidden).
   * Used by graph evidence-link validation.
   */
  async listIdsInCase(
    exec: DbExec,
    caseId: string,
    evidenceIds: string[]
  ): Promise<{ id: string }[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const normalized = normalizeUuidList(evidenceIds);
    if (normalized.length === 0) return [];
    return exec
      .select({ id: evidence.id })
      .from(evidence)
      .where(
        and(eq(evidence.caseId, scopedCaseId), inArray(evidence.id, normalized))
      );
  },

  /** Label fields for job/activity chrome — includes hidden when explicitly referenced. */
  async listActivityLabelsInCase(
    exec: DbExec,
    caseId: string,
    evidenceIds: string[]
  ): Promise<
    {
      id: string;
      label: string | null;
      kind: EvidenceKind;
      sourceUrl: string | null;
    }[]
  > {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const normalized = normalizeUuidList(evidenceIds);
    if (normalized.length === 0) return [];
    return exec
      .select({
        id: evidence.id,
        label: evidence.label,
        kind: evidence.kind,
        sourceUrl: evidence.sourceUrl,
      })
      .from(evidence)
      .where(
        and(eq(evidence.caseId, scopedCaseId), inArray(evidence.id, normalized))
      );
  },

  async softDelete(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<{ id: string } | null> {
    const scoped = trimScopedCaseIds(caseId, evidenceId);
    if (scoped === null) return null;
    const [row] = await exec
      .update(evidence)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(evidence.id, scoped.resourceId),
          eq(evidence.caseId, scoped.caseId),
          isNull(evidence.deletedAt)
        )
      )
      .returning({ id: evidence.id });
    return row ?? null;
  },

  async restore(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<{ id: string } | null> {
    const scoped = trimScopedCaseIds(caseId, evidenceId);
    if (scoped === null) return null;
    const [row] = await exec
      .update(evidence)
      .set({ deletedAt: null })
      .where(
        and(
          eq(evidence.id, scoped.resourceId),
          eq(evidence.caseId, scoped.caseId),
          isNotNull(evidence.deletedAt)
        )
      )
      .returning({ id: evidence.id });
    return row ?? null;
  },

  /** Active (non-deleted) row fields needed to start a Cap from Evidence. */
  async getCapSeedInCase(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<EvidenceCapSeed | null> {
    const scoped = trimScopedCaseIds(caseId, evidenceId);
    if (scoped === null) return null;
    const [row] = await exec
      .select({
        id: evidence.id,
        entityId: evidence.entityId,
        sourceUrl: evidence.sourceUrl,
        text: evidence.text,
      })
      .from(evidence)
      .where(
        and(
          eq(evidence.id, scoped.resourceId),
          eq(evidence.caseId, scoped.caseId),
          isNull(evidence.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async markProcessed(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<boolean> {
    const scoped = trimScopedCaseIds(caseId, evidenceId);
    if (scoped === null) return false;
    const updated = await exec
      .update(evidence)
      .set({ processedAt: new Date() })
      .where(
        and(
          eq(evidence.id, scoped.resourceId),
          eq(evidence.caseId, scoped.caseId),
          isNull(evidence.deletedAt),
          isNull(evidence.processedAt)
        )
      )
      .returning({ id: evidence.id });
    return updated.length > 0;
  },

  async setEntityInCase(
    exec: DbExec,
    caseId: string,
    evidenceId: string,
    entityId: string | null
  ): Promise<EvidenceRow | null> {
    const scoped = trimScopedCaseIds(caseId, evidenceId);
    if (scoped === null) return null;
    const resolvedEntityId = resolveNullableGraphIdForWrite(entityId);
    if (!resolvedEntityId.ok) return null;
    const nextEntityId = resolvedEntityId.id ?? null;
    const [row] = await exec
      .update(evidence)
      .set({ entityId: nextEntityId })
      .where(
        and(
          eq(evidence.id, scoped.resourceId),
          eq(evidence.caseId, scoped.caseId),
          isNull(evidence.deletedAt)
        )
      )
      .returning(evidenceColumns);
    return row ?? null;
  },
};
