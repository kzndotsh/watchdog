import { and, eq, isNull, or } from "drizzle-orm";

import {
  apiKeyOrganizationId,
  organizationIdSchema,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import { resolveUserOrganizationId } from "../auth/resolve-organization";
import type { DbExec } from "../exec";
import { apiKey } from "../schema/auth";
import { jobStartLimits } from "../schema/job-start-limits";

/** The operator-set limits that apply to one start: the organization's and the key's, if any. */
export type JobStartLimitOverrides = {
  organization: number | null;
  key: number | null;
};

export type JobStartLimitRow = {
  /** Null for the organization's own limit. */
  keyId: string | null;
  maxStarts: number;
};

const columns = {
  keyId: jobStartLimits.keyId,
  maxStarts: jobStartLimits.maxStarts,
} as const;

export const jobStartLimitsRepo = {
  /** The overrides that apply to a start by `keyId` (or a session, with none) in the organization. */
  async forStart(
    exec: DbExec,
    organizationId: OrganizationId,
    keyId: string | undefined
  ): Promise<JobStartLimitOverrides> {
    const rows = await exec
      .select(columns)
      .from(jobStartLimits)
      .where(
        and(
          eq(jobStartLimits.organizationId, organizationId),
          keyId === undefined
            ? isNull(jobStartLimits.keyId)
            : or(isNull(jobStartLimits.keyId), eq(jobStartLimits.keyId, keyId))
        )
      );
    return {
      organization: rows.find((row) => row.keyId === null)?.maxStarts ?? null,
      key: rows.find((row) => row.keyId !== null)?.maxStarts ?? null,
    };
  },

  /** Every override of the organization: its own and each key's. */
  async listForOrganization(
    exec: DbExec,
    organizationId: OrganizationId
  ): Promise<JobStartLimitRow[]> {
    return exec
      .select(columns)
      .from(jobStartLimits)
      .where(eq(jobStartLimits.organizationId, organizationId));
  },

  async setForOrganization(
    exec: DbExec,
    organizationId: OrganizationId,
    maxStarts: number
  ): Promise<JobStartLimitRow | undefined> {
    const [row] = await exec
      .insert(jobStartLimits)
      .values({ organizationId, keyId: null, maxStarts })
      .onConflictDoUpdate({
        target: jobStartLimits.organizationId,
        targetWhere: isNull(jobStartLimits.keyId),
        set: { maxStarts },
      })
      .returning(columns);
    return row;
  },

  /** Set one key's limit. The key's row keeps the organization it was first set in. */
  async setForKey(
    exec: DbExec,
    organizationId: OrganizationId,
    keyId: string,
    maxStarts: number
  ): Promise<JobStartLimitRow | undefined> {
    const [row] = await exec
      .insert(jobStartLimits)
      .values({ organizationId, keyId, maxStarts })
      .onConflictDoUpdate({
        target: jobStartLimits.keyId,
        set: { maxStarts },
        setWhere: eq(jobStartLimits.organizationId, organizationId),
      })
      .returning(columns);
    return row;
  },

  /** Remove the organization's own override; true when there was one. */
  async clearForOrganization(
    exec: DbExec,
    organizationId: OrganizationId
  ): Promise<boolean> {
    const rows = await exec
      .delete(jobStartLimits)
      .where(
        and(
          eq(jobStartLimits.organizationId, organizationId),
          isNull(jobStartLimits.keyId)
        )
      )
      .returning({ id: jobStartLimits.id });
    return rows.length > 0;
  },

  /** Remove one key's override in the organization; true when there was one. */
  async clearForKey(
    exec: DbExec,
    organizationId: OrganizationId,
    keyId: string
  ): Promise<boolean> {
    const rows = await exec
      .delete(jobStartLimits)
      .where(
        and(
          eq(jobStartLimits.organizationId, organizationId),
          eq(jobStartLimits.keyId, keyId)
        )
      )
      .returning({ id: jobStartLimits.id });
    return rows.length > 0;
  },

  /**
   * The organization an API key acts in, resolved as authentication does (`createApiContext`): the
   * organization its `metadata` names, if its owner is still a member. `null` when the key
   * acts in none (no organization named, or its owner left it), `undefined` when no such key
   * exists.
   */
  async keyOrganization(
    exec: DbExec,
    keyId: string
  ): Promise<OrganizationId | null | undefined> {
    const [row] = await exec
      .select({ metadata: apiKey.metadata, ownerId: apiKey.referenceId })
      .from(apiKey)
      .where(eq(apiKey.id, keyId))
      .limit(1);
    if (row === undefined) return undefined;
    const scoped = organizationIdSchema.safeParse(
      apiKeyOrganizationId(row.metadata)
    );
    if (!scoped.success) return null;
    return resolveUserOrganizationId(exec, row.ownerId, scoped.data);
  },
};
