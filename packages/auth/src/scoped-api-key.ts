import { scopesToPermissions } from "@watchdog/schemas/shared";
import type { OrganizationId, Scope } from "@watchdog/schemas/shared";

import type { createAuth } from "./create-auth";

type ScopedKeyAuth = Pick<ReturnType<typeof createAuth>["api"], "createApiKey">;

export type ScopedApiKeyInput = {
  /** The signed-in user, from the session: the key acts as this user. */
  userId: string;
  /** The user's active organization, resolved on the server; `null` when they have none. */
  organizationId: OrganizationId | null;
  name?: string;
  scopes: readonly Scope[];
  /** Lifetime in seconds; the instance default (90 days) when omitted. */
  expiresIn?: number;
};

/**
 * Create an API key with its scopes (`permissions`) and organization (`metadata`) set by the
 * server. The call carries no `headers`, which is how Better Auth's api-key plugin tells a
 * trusted server call from a client request: only the former may set `permissions` and name
 * the owner. The browser path to `/api-key/create` is closed in `createAuth`'s `hooks.before`
 * (`api-key-guard.ts`). `scopes` are normalised (write implies read, `cases:read` always).
 * Returns the plaintext key, which is not stored and cannot be read again.
 */
export async function createScopedApiKey(
  auth: { api: ScopedKeyAuth },
  input: ScopedApiKeyInput
) {
  const created = await auth.api.createApiKey({
    body: {
      userId: input.userId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.expiresIn === undefined ? {} : { expiresIn: input.expiresIn }),
      permissions: scopesToPermissions(input.scopes),
      ...(input.organizationId
        ? { metadata: { organizationId: input.organizationId } }
        : {}),
    },
  });
  return { id: created.id, name: created.name, key: created.key };
}
