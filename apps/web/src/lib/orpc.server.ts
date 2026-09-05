import "@tanstack/react-start/server-only";
import { createRouterClient, type RouterClient } from "@orpc/server";

import { actorFromSession } from "@/auth/api-context.server";
import { router, type ApiActor, type AppRouter } from "@watchdog/api";
import { peekRequestLogger } from "@watchdog/log";

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
  organizationId: string | null;
}): RouterClient<AppRouter> {
  return orpcForActor(
    actorFromSession(context.session, context.organizationId)
  );
}

export { actorFromSession };
