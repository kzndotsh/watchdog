import { createMiddleware } from "@tanstack/react-start";

import { resolveActorOrganizationId } from "@/auth/server";

/** Server-fn middleware — enforces a session before the handler runs. */
export const requireAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { requireSession } = await import("@/auth/session.server");
    const session = await requireSession();
    const organizationId = await resolveActorOrganizationId(
      session.user.id,
      session.session.activeOrganizationId
    );
    return next({ context: { session, organizationId } });
  }
);
