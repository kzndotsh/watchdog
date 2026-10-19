import { createAuthMiddleware } from "better-auth/api";
import { expireCookie } from "better-auth/cookies";

/**
 * How long a signed session cookie is trusted without re-reading the session row. A session
 * revoked in the database (sign-out elsewhere, "revoke sessions", a ban) keeps working for
 * at most this long on the cached path. Documented in `docs/how-to/auth-setup.md`.
 */
export const SESSION_COOKIE_CACHE_SECONDS = 60;

/**
 * Better Auth `session.cookieCache`. `refreshCache` must stay `false`: when on, the cache is
 * re-signed before it expires without reading the database, so revocation would no longer be
 * bounded by `maxAge`.
 */
export const sessionCookieCache = {
  enabled: true,
  maxAge: SESSION_COOKIE_CACHE_SECONDS,
  refreshCache: false,
} as const;

/**
 * Endpoints that change who may do what. They read the session from the database even
 * when a cached cookie is present, so a demoted admin, a disabled user or a member who
 * was just removed cannot act on a cookie that is up to a minute old. Every `/admin/*`
 * endpoint (disable, set role, revoke sessions, list users) plus the organization
 * endpoints that change membership, roles or the organization itself.
 *
 * Better Auth 1.7.7 already reads the session authoritatively in its admin middleware, but
 * its organization endpoints use the cached session. Covering `/admin/*` here as well keeps
 * the rule in one place and survives a plugin change.
 */
const AUTHORITATIVE_ORGANIZATION_PATHS: ReadonlySet<string> = new Set([
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/leave",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
]);

export function needsAuthoritativeSession(path: string | undefined): boolean {
  if (path === undefined) return false;
  return (
    path.startsWith("/admin/") || AUTHORITATIVE_ORGANIZATION_PATHS.has(path)
  );
}

const CHUNK_SUFFIX = /\.\d+$/;

const nameOf = (line: string) => line.split("=", 1)[0] ?? "";

/**
 * Better Auth splits a cookie cache that does not fit one cookie into `session_data.0`,
 * `.1`, ... Every chunk then rides on every request (page, asset, server function), so a
 * large `user.image` (the profile editor stores a resized avatar as an inline `data:` URL
 * when no upload backend is configured) can push the `Cookie` header past what servers
 * accept. A cache that would be chunked is dropped instead: the browser's copy is expired
 * and the session is read from the database on each request, exactly as without a cache.
 * Returns the replacement `Set-Cookie` lines, or `null` when nothing is chunked.
 */
export function dropChunkedSessionCache(
  setCookies: readonly string[],
  cookieName: string
): string[] | null {
  const isCache = (name: string) =>
    name === cookieName ||
    (name.startsWith(`${cookieName}.`) && CHUNK_SUFFIX.test(name));
  const cacheLines = setCookies.filter((line) => isCache(nameOf(line)));
  const chunked = cacheLines.some((line) => CHUNK_SUFFIX.test(nameOf(line)));
  if (!chunked) return null;

  const attributes = (cacheLines[0] ?? "")
    .split(";")
    .slice(1)
    .map((part) => part.trim())
    .filter((part) => !/^(max-age|expires)=/i.test(part));
  const expire = (name: string) =>
    [`${name}=`, ...attributes, "Max-Age=0"].join("; ");

  const kept = setCookies.filter((line) => !isCache(nameOf(line)));
  const names = new Set([cookieName, ...cacheLines.map(nameOf)]);
  return [...kept, ...[...names].map(expire)];
}

/**
 * Endpoints that change the session row's `activeOrganizationId` (create, accept an
 * invitation, leave, delete, remove yourself) through the database adapter, without
 * re-signing the cached cookie. Left alone, the cookie keeps the old organization for up
 * to 60 s: a just-created organization would not be the active one on the next request.
 */
const SESSION_ROW_CHANGING_PATHS: ReadonlySet<string> = new Set([
  "/organization/create",
  "/organization/delete",
  "/organization/leave",
  "/organization/accept-invitation",
  "/organization/remove-member",
]);

export function changesSessionRow(path: string | undefined): boolean {
  return path !== undefined && SESSION_ROW_CHANGING_PATHS.has(path);
}

/**
 * Better Auth `hooks.after`, two jobs on the response cookies:
 * - after an endpoint that changed the session row, expire the cache cookie, so the next
 *   request reads the row and re-issues it with the new organization;
 * - drop a cache that would be chunked (`dropChunkedSessionCache`).
 */
export const sessionCacheAfterHook = createAuthMiddleware(async (ctx) => {
  if (changesSessionRow(ctx.path)) {
    expireCookie(ctx, ctx.context.authCookies.sessionData);
    return;
  }
  const headers = ctx.context.responseHeaders;
  if (!headers) return;
  const replacement = dropChunkedSessionCache(
    headers.getSetCookie(),
    ctx.context.authCookies.sessionData.name
  );
  if (!replacement) return;
  headers.delete("set-cookie");
  for (const line of replacement) headers.append("set-cookie", line);
});
