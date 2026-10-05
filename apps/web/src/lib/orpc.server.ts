import { createRouterClient, type RouterClient } from "@orpc/server";
import "@tanstack/react-start/server-only";

import { router, type AppRouter } from "@watchdog/api";
import { actorFromSession } from "@watchdog/auth/server";
import { peekRequestLogger } from "@watchdog/log";
import type { ApiActor, OrganizationId } from "@watchdog/schemas/shared";

export { orpcNullIfNotFound } from "@/lib/orpc-null-if-not-found";

export function orpcForActor(actor: ApiActor): RouterClient<AppRouter> {
  return createRouterClient(router, {
    context: {
      headers: new Headers(),
      actor,
      authMethod: "session",
      log: peekRequestLogger(),
    },
  });
}

type SessionForActor = Parameters<typeof actorFromSession>[0];

/** ServerFn handler context → in-process oRPC client for the authenticated actor. */
export function orpcFromContext(context: {
  session: SessionForActor;
  organizationId: OrganizationId | null;
}): RouterClient<AppRouter> {
  return orpcForActor(
    actorFromSession(context.session, context.organizationId)
  );
}
