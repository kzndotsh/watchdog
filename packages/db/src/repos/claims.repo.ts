import { and, asc, eq, inArray } from "drizzle-orm";

import { normalizeUuidList, trimmedOrUndefined } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { claims } from "../schema/claims";
import { entities } from "../schema/entities";
import { entityRowInCase } from "./_entity-in-case";
import {
  trimActorId,
  trimCaseId,
  trimResourceId,
  trimScopedCaseIds,
} from "./_scoped-ids";

export const claimColumns = {
  id: claims.id,
  entityId: claims.entityId,
  class: claims.class,
  text: claims.text,
  confidence: claims.confidence,
  retracted: claims.retracted,
  retractKind: claims.retractKind,
  retractedReason: claims.retractedReason,
  retractedBy: claims.retractedBy,
  retractedAt: claims.retractedAt,
} as const;

export type ClaimRow = {
  [K in keyof typeof claimColumns]: (typeof claims.$inferSelect)[K &
    keyof typeof claims.$inferSelect];
};

export type NewClaim = Pick<
  typeof claims.$inferInsert,
  "entityId" | "text" | "confidence" | "class"
> &
  Partial<Pick<typeof claims.$inferInsert, "id">>;

export type ClaimPatch = Partial<
  Pick<typeof claims.$inferInsert, "text" | "class" | "confidence">
>;

export interface RetractClaimValues {
  retractKind: NonNullable<(typeof claims.$inferSelect)["retractKind"]>;
  retractedReason: string;
  retractedBy: string;
}

export interface ClaimTextKey {
  entityId: string;
  text: string;
}

function claimTextForWrite(text: string): string | undefined {
  return trimmedOrUndefined(text);
}

function claimPatchForWrite(patch: ClaimPatch): ClaimPatch | null {
  if (patch.text === undefined) return patch;
  const text = claimTextForWrite(patch.text);
  if (text === undefined) return null;
  return { ...patch, text };
}

export const claimsRepo = {
  async listForEntity(
    exec: DbExec,
    entityId: string,
    opts?: { includeRetracted?: boolean }
  ): Promise<ClaimRow[]> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return [];
    return exec
      .select(claimColumns)
      .from(claims)
      .where(
        and(
          eq(claims.entityId, scopedEntityId),
          opts?.includeRetracted === true
            ? undefined
            : eq(claims.retracted, false)
        )
      )
      .orderBy(asc(claims.createdAt));
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    claimId: string
  ): Promise<ClaimRow | null> {
    const scoped = trimScopedCaseIds(caseId, claimId);
    if (!scoped) return null;
    const [row] = await exec
      .select(claimColumns)
      .from(claims)
      .innerJoin(entities, eq(claims.entityId, entities.id))
      .where(
        and(
          eq(claims.id, scoped.resourceId),
          eq(entities.caseId, scoped.caseId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /** Active claim text keys for FP suppress — scoped to case + entity ids. */
  async listTextKeysInCase(
    exec: DbExec,
    caseId: string,
    entityIds: string[]
  ): Promise<ClaimTextKey[]> {
    const scopedCaseId = trimCaseId(caseId);
    const normalized = normalizeUuidList(entityIds);
    if (scopedCaseId === undefined || normalized.length === 0) return [];
    return exec
      .select({ entityId: claims.entityId, text: claims.text })
      .from(claims)
      .innerJoin(entities, eq(claims.entityId, entities.id))
      .where(
        and(
          eq(entities.caseId, scopedCaseId),
          inArray(claims.entityId, normalized),
          eq(claims.retracted, false)
        )
      );
  },

  async create(exec: DbExec, values: NewClaim): Promise<ClaimRow | null> {
    const scopedEntityId = trimResourceId(values.entityId);
    if (scopedEntityId === undefined) return null;
    const text = claimTextForWrite(values.text);
    if (text === undefined) return null;
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const [created] = await exec
      .insert(claims)
      .values({ ...values, id, entityId: scopedEntityId, text })
      .returning(claimColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    claimId: string,
    patch: ClaimPatch
  ): Promise<ClaimRow | null> {
    const scopedClaimId = trimResourceId(claimId);
    if (scopedClaimId === undefined) return null;
    const normalizedPatch = claimPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(claims)
      .set(normalizedPatch)
      .where(eq(claims.id, scopedClaimId))
      .returning(claimColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    claimId: string,
    patch: ClaimPatch
  ): Promise<ClaimRow | null> {
    const scoped = trimScopedCaseIds(caseId, claimId);
    if (!scoped) return null;
    const normalizedPatch = claimPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(claims)
      .set(normalizedPatch)
      .where(
        and(
          eq(claims.id, scoped.resourceId),
          entityRowInCase(claims.entityId, scoped.caseId)
        )
      )
      .returning(claimColumns);
    return updated ?? null;
  },

  async retract(
    exec: DbExec,
    claimId: string,
    values: RetractClaimValues
  ): Promise<ClaimRow | null> {
    const scopedClaimId = trimResourceId(claimId);
    if (scopedClaimId === undefined) return null;
    const scopedRetractedBy = trimActorId(values.retractedBy);
    const [row] = await exec
      .update(claims)
      .set({
        retracted: true,
        retractKind: values.retractKind,
        retractedReason: values.retractedReason,
        retractedBy: scopedRetractedBy ?? null,
        retractedAt: new Date(),
      })
      .where(eq(claims.id, scopedClaimId))
      .returning(claimColumns);
    return row ?? null;
  },

  async retractInCase(
    exec: DbExec,
    caseId: string,
    claimId: string,
    values: RetractClaimValues
  ): Promise<ClaimRow | null> {
    const scoped = trimScopedCaseIds(caseId, claimId);
    if (!scoped) return null;
    const scopedRetractedBy = trimActorId(values.retractedBy);
    const [row] = await exec
      .update(claims)
      .set({
        retracted: true,
        retractKind: values.retractKind,
        retractedReason: values.retractedReason,
        retractedBy: scopedRetractedBy ?? null,
        retractedAt: new Date(),
      })
      .where(
        and(
          eq(claims.id, scoped.resourceId),
          entityRowInCase(claims.entityId, scoped.caseId)
        )
      )
      .returning(claimColumns);
    return row ?? null;
  },
};
