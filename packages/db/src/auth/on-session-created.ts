import type { DbExec } from "../exec";
import { insertAuthEvent } from "./auth-events";
import { setSessionActiveOrganization } from "./instance-bootstrap";
import { resolveUserOrganizationId } from "./resolve-organization";

/**
 * A fresh session starts in the user's oldest organization (if any) and records
 * `session.created`. Users with no organization yet land in onboarding instead.
 */
export async function onAuthSessionCreated(
  exec: DbExec,
  created: {
    id: string;
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<void> {
  const organizationId = await resolveUserOrganizationId(exec, created.userId);
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
