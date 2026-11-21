import { eq } from "drizzle-orm";

import type { DbExec } from "../exec";
import { apiKey } from "../schema/auth";

/**
 * Why an API key can no longer act, or `usable`. `missing` covers a deleted key and a key that
 * now belongs to someone else than `ownerId` (a Job keeps the key's id, never its secret).
 */
export type ApiKeyStatus = "usable" | "missing" | "disabled" | "expired";

/** Whether the key `keyId`, issued to `ownerId`, still exists, is enabled and has not expired. */
export async function apiKeyStatus(
  exec: DbExec,
  keyId: string,
  ownerId: string,
  now: Date = new Date()
): Promise<ApiKeyStatus> {
  const [row] = await exec
    .select({
      referenceId: apiKey.referenceId,
      enabled: apiKey.enabled,
      expiresAt: apiKey.expiresAt,
    })
    .from(apiKey)
    .where(eq(apiKey.id, keyId))
    .limit(1);
  if (row?.referenceId !== ownerId) return "missing";
  if (row.enabled === false) return "disabled";
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "usable";
}
