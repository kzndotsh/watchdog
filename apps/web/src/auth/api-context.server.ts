import "@tanstack/react-start/server-only";
import { auth, resolveActorOrganizationId } from "@/auth/server";
import type { ApiActor, ApiContext } from "@watchdog/api";
import { identifyUser, peekRequestLogger } from "@watchdog/log";

export function actorFromSession(
  session: {
    user: { id: string; email?: string | null; name?: string | null };
  },
  organizationId: string | null
): ApiActor {
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    organizationId,
  };
}

function extractApiKey(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return headers.get("x-api-key");
}

export async function createApiContext(request: Request): Promise<ApiContext> {
  const log = peekRequestLogger();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user) {
    if (log) {
      identifyUser(log, session, { maskEmail: true });
      log.set({ auth: { method: "session" } });
    }
    const organizationId = await resolveActorOrganizationId(
      session.user.id,
      session.session.activeOrganizationId
    );
    return {
      headers: request.headers,
      actor: actorFromSession(session, organizationId),
      authMethod: "session",
      log,
    };
  }

  const key = extractApiKey(request.headers);
  if (key) {
    const result = await auth.api.verifyApiKey({ body: { key } });
    if (result.valid && result.key) {
      const userId = result.key.referenceId;
      const organizationId = await resolveActorOrganizationId(userId);
      if (log) {
        log.set({
          auth: { method: "apiKey" },
          userId,
          user: {
            id: userId,
            name: `api-key:${result.key.name ?? result.key.id}`,
          },
        });
      }
      return {
        headers: request.headers,
        actor: {
          userId,
          email: null,
          name: `api-key:${result.key.name ?? result.key.id}`,
          organizationId,
        },
        authMethod: "apiKey",
        log,
      };
    }
    if (log) {
      log.set({
        auth: { method: "apiKey", denied: true, reason: "invalid_api_key" },
      });
    }
  } else if (log) {
    log.set({ auth: { method: "none" } });
  }

  return { headers: request.headers, actor: null, log };
}
