import { inArray } from "drizzle-orm";

import { normalizeUuidList } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { user } from "../schema/auth";

export interface UserDisplayRow {
  id: string;
  name: string;
  email: string;
}

export const usersRepo = {
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
