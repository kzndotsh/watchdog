import { createMiddleware } from "@tanstack/react-start";

import { resolveActorOrganizationId } from "@watchdog/auth/server";

/** Server-fn middleware — enforces a session before the handler runs. */
export const requireAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const [{ requireSession }, { authDb }] = await Promise.all([
      import("@/auth/session.server"),
      import("@/auth/server"),
    ]);
    const session = await requireSession();
    const organizationId = await resolveActorOrganizationId(
      authDb,
      session.user.id,
      session.session.activeOrganizationId
    );
    return next({ context: { session, organizationId } });
  }
);
