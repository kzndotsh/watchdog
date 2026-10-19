import { z } from "zod";

import { SCOPES, scopeSchema } from "@watchdog/schemas/shared";

import { authed } from "../os";

const whoamiSchema = z.object({
  credential: z.enum(["session", "apiKey"]),
  /** Better Auth `apikey.id` of the calling key; null for a session. */
  keyId: z.string().nullable(),
  /** Scopes the caller holds (write scopes imply `cases:read`); a session holds every scope. */
  scopes: z.array(scopeSchema),
  organizationId: z.string(),
});

/** Who is calling: how they authenticated, with which scopes, in which organization. */
export const whoami = authed
  // Every key holds cases:read (a write scope implies it), so any key may ask.
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/auth/whoami",
    summary: "Show the caller's credential kind, scopes and organization",
    tags: ["auth"],
  })
  .output(whoamiSchema)
  .handler(({ context }) => {
    const { credential, actor } = context;
    if (credential.kind === "session") {
      return {
        credential: "session" as const,
        keyId: null,
        scopes: [...SCOPES],
        organizationId: actor.organizationId,
      };
    }
    return {
      credential: "apiKey" as const,
      keyId: credential.keyId,
      scopes: SCOPES.filter((scope) => credential.scopes.has(scope)),
      organizationId: actor.organizationId,
    };
  });
