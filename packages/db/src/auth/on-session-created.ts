import type { DbExec } from "../exec";
import { insertAuthEvent } from "./auth-events";
import {
  bootstrapWatchdogOrganization,
  setSessionActiveOrganization,
} from "./bootstrap-organization";

export async function onAuthSessionCreated(
  exec: DbExec,
  created: {
    id: string;
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<void> {
  const { organizationId } = await bootstrapWatchdogOrganization(
    exec,
    created.userId
  );
  if (organizationId) {
    await setSessionActiveOrganization(exec, created.id, organizationId);
  }
  await insertAuthEvent(exec, {
    userId: created.userId,
    kind: "session.created",
    ipAddress: created.ipAddress,
    userAgent: created.userAgent,
  });
}
