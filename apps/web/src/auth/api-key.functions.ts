import { createServerFn } from "@tanstack/react-start";

import { createScopedApiKey } from "@watchdog/auth/server";
import { createApiKeyInputSchema } from "@watchdog/schemas/shared";

/**
 * Create an API key for the signed-in user (session only: `requireAuth` runs first). The
 * scopes come from the form; the organization is the session's, resolved by the middleware,
 * never read from the request. Better Auth's own create endpoint is closed to the browser
 * (`@watchdog/auth` `api-key-guard.ts`), so this is the only way a key is made.
 * Returns the plaintext key once.
 */
export const createApiKeyFn = createServerFn({ method: "POST" })
  .validator(createApiKeyInputSchema)
  .handler(async ({ data, context }) => {
    const { auth } = await import("@/auth/server");
    return createScopedApiKey(auth, {
      userId: context.session.user.id,
      organizationId: context.organizationId,
      name: data.name,
      scopes: data.scopes,
      expiresIn: data.expiresIn,
    });
  });
