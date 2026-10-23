import { eq, inArray } from "drizzle-orm";

import { normalizeUuidList } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { user } from "../schema/auth";

export type UserDisplayRow = {
  id: string;
  name: string;
  email: string;
};

export const usersRepo = {
  /** The user's Better Auth role (`auth.user.role`); null when unset, `undefined` when no such user. */
  async getRole(
    exec: DbExec,
    userId: string
  ): Promise<{ role: string | null } | undefined> {
    const [row] = await exec
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row;
  },

  async getByIds(exec: DbExec, ids: string[]): Promise<UserDisplayRow[]> {
    const unique = normalizeUuidList(ids);
    if (unique.length === 0) return [];
    return exec
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(inArray(user.id, unique));
  },
};
