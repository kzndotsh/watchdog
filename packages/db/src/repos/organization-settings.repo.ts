import { and, eq } from "drizzle-orm";

import type { OrganizationId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { member } from "../schema/auth";
import { organizationSettings } from "../schema/organization-settings";

export type OrganizationSettingsRow = {
  organizationId: OrganizationId;
  externalAiHandoff: boolean;
};

export type OrganizationSettingsPatch = {
  externalAiHandoff: boolean;
};

const columns = {
  organizationId: organizationSettings.organizationId,
  externalAiHandoff: organizationSettings.externalAiHandoff,
} as const;

export const organizationSettingsRepo = {
  /** The stored row, or `undefined` when the organization never changed a setting. */
  async get(
    exec: DbExec,
    organizationId: OrganizationId
  ): Promise<OrganizationSettingsRow | undefined> {
    const [row] = await exec
      .select(columns)
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, organizationId))
      .limit(1);
    return row;
  },

  async upsert(
    exec: DbExec,
    organizationId: OrganizationId,
    patch: OrganizationSettingsPatch
  ): Promise<OrganizationSettingsRow | undefined> {
    const [row] = await exec
      .insert(organizationSettings)
      .values({ organizationId, ...patch })
      .onConflictDoUpdate({
        target: organizationSettings.organizationId,
        set: { ...patch, updatedAt: new Date() },
      })
      .returning(columns);
    return row;
  },

  /** The user's Better Auth role in the organization; `undefined` when they are not a member. */
  async memberRole(
    exec: DbExec,
    organizationId: OrganizationId,
    userId: string
  ): Promise<string | undefined> {
    const [row] = await exec
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId)
        )
      )
      .limit(1);
    return row?.role;
  },
};
