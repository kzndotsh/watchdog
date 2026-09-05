import type { DbExec } from "../exec";
import { authEvent, type AuthEventKind } from "../schema/auth";

export interface InsertAuthEventInput {
  userId: string;
  kind: AuthEventKind;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function insertAuthEvent(
  exec: DbExec,
  input: InsertAuthEventInput
): Promise<void> {
  await exec.insert(authEvent).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    kind: input.kind,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}
