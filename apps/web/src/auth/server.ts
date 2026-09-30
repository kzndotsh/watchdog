import "@tanstack/react-start/server-only";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createAuth } from "@watchdog/auth/server";

export { resolveActorOrganizationId } from "@watchdog/auth/server";

// tanstackStartCookies() must stay last so later plugins' Set-Cookie isn't dropped.
export const auth = createAuth({
  trailingPlugins: [tanstackStartCookies()],
  // Cases reference organizations by soft id: delete them (graph, artifacts, export
  // dir) first, so removing an organization never orphans evidence.
  beforeDeleteOrganization: async ({ organizationId, actorId }) => {
    const { deleteOrganizationCasesEffect, runDomain } =
      await import("@watchdog/core");
    await runDomain(deleteOrganizationCasesEffect(organizationId, { actorId }));
  },
});

export type Session = typeof auth.$Infer.Session;
