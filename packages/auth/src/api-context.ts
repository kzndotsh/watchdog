import { identifyUser, peekRequestLogger } from "@watchdog/log";
import type { AuditableLogger } from "@watchdog/log";
import type { ApiActor, ApiCaller } from "@watchdog/schemas";

import { resolveActorOrganizationId } from "./actor";
import type { createAuth } from "./create-auth";

/** The two Better Auth calls the API context needs (any `createAuth()` result satisfies this). */
type ApiContextAuth = Pick<
  ReturnType<typeof createAuth>["api"],
  "getSession" | "verifyApiKey"
>;

/** Same shape as `@watchdog/api`'s `ApiContext` (caller + optional request logger). */
export type AuthedApiContext = ApiCaller & { log?: AuditableLogger };

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

/**
 * Organization an API key was issued for (`metadata.organizationId`, set when the key is
 * created in the UI). Keys without it predate multi-organization and act in the owner's
 * oldest organization.
 */
function keyOrganizationId(metadata: unknown): string | null {
  let parsed = metadata;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "organizationId" in parsed &&
    typeof parsed.organizationId === "string" &&
    parsed.organizationId !== ""
  ) {
    return parsed.organizationId;
  }
  return null;
}

function extractApiKey(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return headers.get("x-api-key");
}

/**
 * Resolve who is calling: a session cookie (Dossier) or an API key (agent ingress).
 * `auth` is the app's Better Auth instance.
 */
export async function createApiContext(
  auth: { api: ApiContextAuth },
  request: Request
): Promise<AuthedApiContext> {
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
      const scopedOrganizationId = keyOrganizationId(result.key.metadata);
      const organizationId = await resolveActorOrganizationId(
        userId,
        scopedOrganizationId
      );
      // A scoped key stops working when its owner leaves that organization.
      if (scopedOrganizationId === null || organizationId !== null) {
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
