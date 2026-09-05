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

import type { DbExec } from "../exec";
import { evidence } from "../schema/evidence";
import { containsPattern } from "./_ilike";

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
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .where(
        and(
          eq(evidence.caseId, caseId),
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
    const pattern = containsPattern(term);
    if (pattern === null) return [];
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .where(
        and(
          eq(evidence.caseId, caseId),
          isNull(evidence.deletedAt),
          or(
            ilike(evidence.label, pattern),
            ilike(evidence.notes, pattern),
            ilike(evidence.sourceUrl, pattern),
            ilike(evidence.text, pattern)
          )
        )
      )
      .orderBy(desc(evidence.capturedAt))
      .limit(limit);
  },

  /** Active evidence attached to an entity — export order (oldest first). */
  async listForEntity(
    exec: DbExec,
    caseId: string,
    entityId: string
  ): Promise<EvidenceRow[]> {
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .where(
        and(
          eq(evidence.caseId, caseId),
          eq(evidence.entityId, entityId),
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
    return exec
      .select(evidenceColumns)
      .from(evidence)
      .where(and(eq(evidence.caseId, caseId), isNull(evidence.deletedAt)))
      .orderBy(asc(evidence.capturedAt));
  },

  async getActiveInCase(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<EvidenceRow | null> {
    const [row] = await exec
      .select(evidenceColumns)
      .from(evidence)
      .where(
        and(
          eq(evidence.id, evidenceId),
          eq(evidence.caseId, caseId),
          isNull(evidence.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async create(exec: DbExec, values: NewEvidence): Promise<EvidenceRow | null> {
    const [created] = await exec
      .insert(evidence)
      .values(values)
      .returning(evidenceColumns);
    return created ?? null;
  },

  /** Soft-deleted rows included — Hidden dumps must stay downloadable. */
  async getUriInCaseIncludingDeleted(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<{ uri: string | null } | null> {
    const [row] = await exec
      .select({ uri: evidence.uri })
      .from(evidence)
      .where(and(eq(evidence.id, evidenceId), eq(evidence.caseId, caseId)))
      .limit(1);
    return row ?? null;
  },

  /**
   * Active (non-deleted) Evidence ids that exist in the Case.
   * Used by assertEvidenceInCase — soft-deleted rows are excluded.
   */
  async listIdsInCase(
    exec: DbExec,
    caseId: string,
    evidenceIds: string[]
  ): Promise<{ id: string }[]> {
    if (evidenceIds.length === 0) return [];
    return exec
      .select({ id: evidence.id })
      .from(evidence)
      .where(
        and(
          eq(evidence.caseId, caseId),
          isNull(evidence.deletedAt),
          inArray(evidence.id, evidenceIds)
        )
      );
  },

  async softDelete(
    exec: DbExec,
    caseId: string,
    evidenceId: string
  ): Promise<{ id: string } | null> {
    const [row] = await exec
      .update(evidence)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(evidence.id, evidenceId),
          eq(evidence.caseId, caseId),
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
    const [row] = await exec
      .update(evidence)
      .set({ deletedAt: null })
      .where(
        and(
          eq(evidence.id, evidenceId),
          eq(evidence.caseId, caseId),
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
          eq(evidence.id, evidenceId),
          eq(evidence.caseId, caseId),
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
    const updated = await exec
      .update(evidence)
      .set({ processedAt: new Date() })
      .where(
        and(
          eq(evidence.id, evidenceId),
          eq(evidence.caseId, caseId),
          isNull(evidence.deletedAt)
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
    const [row] = await exec
      .update(evidence)
      .set({ entityId })
      .where(
        and(
          eq(evidence.id, evidenceId),
          eq(evidence.caseId, caseId),
          isNull(evidence.deletedAt)
        )
      )
      .returning(evidenceColumns);
    return row ?? null;
  },
};
