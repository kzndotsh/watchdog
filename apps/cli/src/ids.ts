import { uuidSchema } from "@watchdog/schemas";

import { api } from "./client";
import { fail } from "./io";

/** Comma-separated UUID list (shared by graph / proposals / child writes). */
export function parseIdList(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw === "") return undefined;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

/**
 * Child oRPC procedures take entity UUID; `entities.get` is slug-only.
 * Accept either and resolve.
 */
export async function resolveEntityId(
  caseId: string,
  slugOrUuid: string
): Promise<string> {
  const trimmed = slugOrUuid.trim();
  if (trimmed === "") {
    fail("USAGE", "--entity is required", {
      help: ["wd entities list -c <caseId>"],
    });
  }
  const asUuid = uuidSchema.safeParse(trimmed);
  if (asUuid.success) return asUuid.data;
  const row = await api().entities.get({ caseId, slug: trimmed });
  return row.id;
}
