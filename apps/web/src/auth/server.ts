import "@tanstack/react-start/server-only";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createAuth } from "@watchdog/auth/server";
import { sharedDb } from "@watchdog/core/infra";

// Better Auth is built at module load, before any request builds the API runtime, so it
// takes the process pool by value: `sharedDb()` is the pool `Db.owned` (AppLive) owns, so
// web has one pool and one owner, and the dev reload hook that disposes the runtime ends it.
export const authDb = sharedDb();

// tanstackStartCookies() must stay last so later plugins' Set-Cookie isn't dropped.
export const auth = createAuth({
  db: authDb,
  trailingPlugins: [tanstackStartCookies()],
  // Cases reference organizations by soft id: delete them (graph, artifacts, export
  // dir) first, so removing an organization never orphans evidence.
  beforeDeleteOrganization: async ({ organizationId, actorId }) => {
    const { deleteOrganizationCasesEffect } =
      await import("@watchdog/core/cases");
    const { runDomain } = await import("@watchdog/core/infra");
    await runDomain(deleteOrganizationCasesEffect(organizationId, { actorId }));
  },
});

export type Session = typeof auth.$Infer.Session;
