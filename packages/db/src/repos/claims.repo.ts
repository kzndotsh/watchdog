import { and, asc, eq, inArray } from "drizzle-orm";

import type { CaseId } from "@watchdog/schemas/shared";
import { normalizeUuidList } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { claims } from "../schema/claims";
import { entities } from "../schema/entities";
import { entityRowInCase } from "./_entity-in-case";
import { keysetAfter, timeKey } from "./_keyset";
import type { KeyedRow, KeysetAfter } from "./_keyset";
import {
  trimActorId,
  trimCaseId,
  trimResourceId,
  trimScopedCaseIds,
} from "./_scoped-ids";
import { atVersion, setOrTouch } from "./_version";

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
  createdAt: claims.createdAt,
  updatedAt: claims.updatedAt,
  createdBy: claims.createdBy,
  updatedBy: claims.updatedBy,
  version: claims.version,
} as const;

export type ClaimRow = {
  [K in keyof typeof claimColumns]: (typeof claims.$inferSelect)[K &
    keyof typeof claims.$inferSelect];
};

export type NewClaim = Pick<
  typeof claims.$inferInsert,
  "entityId" | "caseId" | "text" | "confidence" | "class"
> &
  Partial<Pick<typeof claims.$inferInsert, "id">>;

export type ClaimPatch = Partial<
  Pick<typeof claims.$inferInsert, "text" | "class" | "confidence">
>;

export type RetractClaimValues = {
  retractKind: NonNullable<(typeof claims.$inferSelect)["retractKind"]>;
  retractedReason: string;
  retractedBy: string;
};

export type ClaimTextKey = {
  entityId: string;
  text: string;
};

export const claimsRepo = {
  async listForEntity(
    exec: DbExec,
    entityId: string,
    opts?: { includeRetracted?: boolean; limit?: number; after?: KeysetAfter }
  ): Promise<KeyedRow<ClaimRow>[]> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return [];
    const query = exec
      .select({ ...claimColumns, keyTime: timeKey(claims.createdAt) })
      .from(claims)
      .where(
        and(
          eq(claims.entityId, scopedEntityId),
          opts?.includeRetracted === true
            ? undefined
            : eq(claims.retracted, false),
          keysetAfter({
            idColumn: claims.id,
            keys: [{ column: claims.createdAt, time: true }],
            direction: "asc",
            after: opts?.after,
          })
        )
      )
      .orderBy(asc(claims.createdAt), asc(claims.id));
    return opts?.limit === undefined ? query : query.limit(opts.limit);
  },

  async getInCase(
    exec: DbExec,
    caseId: CaseId,
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
    caseId: CaseId,
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
    const scopedCaseId = trimCaseId(values.caseId);
    if (scopedEntityId === undefined || scopedCaseId === undefined) return null;
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const [created] = await exec
      .insert(claims)
      .values({
        ...values,
        id,
        entityId: scopedEntityId,
        caseId: scopedCaseId,
      })
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
    const [updated] = await exec
      .update(claims)
      .set(patch)
      .where(eq(claims.id, scopedClaimId))
      .returning(claimColumns);
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
    claimId: string,
    expectedVersion: number
  ): Promise<boolean> {
    const scoped = trimScopedCaseIds(caseId, claimId);
    if (!scoped) return false;
    const rows = await exec
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.id, scoped.resourceId),
          entityRowInCase(claims.entityId, scoped.caseId),
          eq(claims.version, expectedVersion)
        )
      )
      .for("update");
    return rows.length > 0;
  },

  async updateInCase(
    exec: DbExec,
    caseId: CaseId,
    claimId: string,
    patch: ClaimPatch,
    expectedVersion?: number
  ): Promise<ClaimRow | null> {
    const scoped = trimScopedCaseIds(caseId, claimId);
    if (!scoped) return null;
    // Without a version to check, an update of the Evidence alone has nothing to write.
    if (Object.keys(patch).length === 0 && expectedVersion === undefined) {
      return claimsRepo.getInCase(exec, scoped.caseId, scoped.resourceId);
    }
    const [updated] = await exec
      .update(claims)
      .set(setOrTouch(patch, scoped.resourceId))
      .where(
        and(
          eq(claims.id, scoped.resourceId),
          entityRowInCase(claims.entityId, scoped.caseId),
          atVersion(claims.version, expectedVersion)
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

  /** Retract a still-live Claim: `retracted = false` is in the UPDATE, so of two concurrent retracts one matches. */
  async retractInCase(
    exec: DbExec,
    caseId: CaseId,
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
          entityRowInCase(claims.entityId, scoped.caseId),
          eq(claims.retracted, false)
        )
      )
      .returning(claimColumns);
    return row ?? null;
  },
};
