import { inArray } from "drizzle-orm";

import type { DbExec } from "../exec";
import { user } from "../schema/auth";

export interface UserDisplayRow {
  id: string;
  name: string;
  email: string;
}

export const usersRepo = {
  async getByIds(exec: DbExec, ids: string[]): Promise<UserDisplayRow[]> {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids)];
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
