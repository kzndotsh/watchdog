import type { DbExec } from "@watchdog/db";
import { identifyUser, peekRequestLogger } from "@watchdog/log";
import type { AuditableLogger } from "@watchdog/log";
import { apiKeyOrganizationId, parseKeyScopes } from "@watchdog/schemas/shared";
import type {
  ApiActor,
  ApiCaller,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { isActorBanned, resolveActorOrganizationId } from "./actor";
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
  organizationId: OrganizationId | null
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

/**
 * Resolve who is calling: a session cookie (Dossier) or an API key (agent ingress).
 * `auth` is the app's Better Auth instance and `db` the pool it was built over.
 */
export async function createApiContext(
  auth: { api: ApiContextAuth },
  request: Request,
  db: DbExec
): Promise<AuthedApiContext> {
  const log = peekRequestLogger();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user) {
    if (log) {
      identifyUser(log, session, { maskEmail: true });
      log.set({ auth: { method: "session" } });
    }
    const organizationId = await resolveActorOrganizationId(
      db,
      session.user.id,
      session.session.activeOrganizationId
    );
    return {
      headers: request.headers,
      actor: actorFromSession(session, organizationId),
      credential: { kind: "session" },
      log,
    };
  }

  const key = extractApiKey(request.headers);
  if (key) {
    const result = await auth.api.verifyApiKey({ body: { key } });
    let reason = "invalid_api_key";
    if (result.valid && result.key) {
      const userId = result.key.referenceId;
      const scopedOrganizationId = apiKeyOrganizationId(result.key.metadata);
      const parsedScopes = parseKeyScopes(result.key.permissions);
      if (!parsedScopes.ok) {
        // Unreadable stored scopes fail closed: the key is denied, never widened.
        reason = "invalid_scopes";
      } else if (await isActorBanned(db, userId)) {
        // A banned owner's keys stop working until the ban expires.
        reason = "banned_user";
      } else {
        const organizationId = await resolveActorOrganizationId(
          db,
          userId,
          scopedOrganizationId
        );
        // A scoped key stops working when its owner leaves that organization.
        if (scopedOrganizationId === null || organizationId !== null) {
          const label = `api-key:${result.key.name ?? result.key.id}`;
          if (log) {
            log.set({
              auth: { method: "apiKey" },
              userId,
              user: { id: userId, name: label },
            });
          }
          return {
            headers: request.headers,
            actor: { userId, email: null, name: label, organizationId },
            credential: {
              kind: "apiKey",
              keyId: result.key.id,
              scopes: parsedScopes.scopes,
            },
            log,
          };
        }
      }
    }
    if (log) {
      log.set({ auth: { method: "apiKey", denied: true, reason } });
    }
  } else if (log) {
    log.set({ auth: { method: "none" } });
  }

  return { headers: request.headers, actor: null, log };
}
