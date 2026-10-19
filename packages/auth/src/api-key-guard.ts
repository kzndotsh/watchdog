import { APIError } from "better-auth/api";

const CREATE_PATH = "/api-key/create";
const UPDATE_PATH = "/api-key/update";

export const API_KEY_CREATE_REFUSED =
  "API keys are created from Settings, not from the browser";
export const API_KEY_UPDATE_REFUSED =
  "An API key's scopes and organization cannot be changed after creation";

type GuardedCall = {
  path: string | undefined;
  /** Set by Better Auth for an HTTP request (`/api/auth/*`). */
  request: Request | undefined;
  /** Set by Better Auth for a call carrying headers: `auth.api.x({ headers })`. */
  headers: Headers | undefined;
  body: unknown;
};

function hasField(body: unknown, field: string): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    field in body &&
    Object.entries(body).some(
      ([key, value]) => key === field && value !== undefined
    )
  );
}

/**
 * The refusal message for a client call that would set a key's scopes or organization, or
 * `null` when the call is allowed. Better Auth's api-key plugin treats a call with
 * `ctx.request` or `ctx.headers` as a client call (it then refuses `permissions` itself);
 * the session-only server function creates keys with neither, which is the one way a key
 * gets its scopes and `metadata.organizationId`. So: a client may not create a key at all,
 * and may rename or disable one but not touch `metadata` or `permissions`.
 */
export function refuseClientApiKeyWrite(call: GuardedCall): string | null {
  if (!call.request && !call.headers) return null;
  if (call.path === CREATE_PATH) return API_KEY_CREATE_REFUSED;
  if (
    call.path === UPDATE_PATH &&
    (hasField(call.body, "metadata") || hasField(call.body, "permissions"))
  ) {
    return API_KEY_UPDATE_REFUSED;
  }
  return null;
}

/**
 * The `hooks.before` rule: throws `FORBIDDEN` for the client calls `refuseClientApiKeyWrite`
 * names. `createAuth` runs it first in its one `hooks.before` middleware.
 */
export function assertNoClientApiKeyWrite(ctx: {
  path?: string;
  request?: Request;
  headers?: Headers;
  body?: unknown;
}): void {
  const message = refuseClientApiKeyWrite({
    path: ctx.path,
    request: ctx.request,
    headers: ctx.headers,
    body: ctx.body,
  });
  if (message !== null) {
    throw APIError.from("FORBIDDEN", {
      code: "API_KEY_CLIENT_WRITE_REFUSED",
      message,
    });
  }
}
