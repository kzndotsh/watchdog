import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";

import type { DbExec } from "@watchdog/db";
import { createApiKeyInputSchema } from "@watchdog/schemas/shared";

import { resolveActorOrganizationId } from "./actor";
import {
  createScopedApiKey,
  SCOPED_API_KEY_CREATE_PATH,
  type ScopedKeyAuth,
} from "./scoped-api-key";

function hasCreateApiKey(api: object): api is ScopedKeyAuth {
  return typeof Reflect.get(api, "createApiKey") === "function";
}

/**
 * The browser's one way to create an API key: `POST /api/auth/api-key/create-scoped`, for a
 * signed-in session only (`sessionMiddleware`; Better Auth's origin check covers CSRF). The body
 * names only the key (`createApiKeyInputSchema`: name, scopes, lifetime); the owner is the
 * session's user and the organization the one they act in (`resolveActorOrganizationId`), never
 * read from the request. It calls `createScopedApiKey` without headers, the trusted server call
 * the api-key plugin allows to set scopes and organization.
 *
 * `bind` hands it the instance's `api` once `betterAuth` has built it (the endpoint is part of
 * that instance, so it cannot take it at construction). It takes a plain object: inside
 * `createAuth` the instance's `api` type depends on the caller's `trailingPlugins`, so the
 * api-key plugin's `createApiKey` is checked at runtime instead.
 */
export function scopedApiKeyPlugin(db: DbExec) {
  let api: ScopedKeyAuth | undefined;
  return {
    bind: (instanceApi: object) => {
      if (api !== undefined) {
        throw new Error("scopedApiKeyPlugin is already bound");
      }
      if (!hasCreateApiKey(instanceApi)) {
        throw new Error("scopedApiKeyPlugin needs the api-key plugin");
      }
      api = instanceApi;
    },
    plugin: {
      id: "scoped-api-key",
      endpoints: {
        createScopedApiKey: createAuthEndpoint(
          SCOPED_API_KEY_CREATE_PATH,
          {
            method: "POST",
            body: createApiKeyInputSchema,
            use: [sessionMiddleware],
          },
          async (ctx) => {
            if (api === undefined) {
              throw new Error("scopedApiKeyPlugin used before bind");
            }
            const { session } = ctx.context;
            // Set by the organization plugin, which this endpoint's session type does not know.
            const preferred: unknown = Reflect.get(
              session.session,
              "activeOrganizationId"
            );
            const organizationId = await resolveActorOrganizationId(
              db,
              session.user.id,
              typeof preferred === "string" ? preferred : null
            );
            return ctx.json(
              await createScopedApiKey(
                { api },
                {
                  userId: session.user.id,
                  organizationId,
                  name: ctx.body.name,
                  scopes: ctx.body.scopes,
                  expiresIn: ctx.body.expiresIn,
                }
              )
            );
          }
        ),
      },
    },
  };
}
