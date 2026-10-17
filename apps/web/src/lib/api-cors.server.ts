import "@tanstack/react-start/server-only";

/**
 * Cross-origin policy for the OpenAPI routes (`/api/v1/*`) and the live-update
 * stream (`/api/events`).
 *
 * CORS headers are sent only for origins in the allowlist, which is Better Auth's
 * configured trusted-origins list (`BETTER_AUTH_URL` plus `BETTER_AUTH_TRUSTED_ORIGINS`):
 * one list for "who may call this install from a browser". A request from any other
 * origin gets no CORS headers, so the browser refuses to expose the response; a
 * request without an `Origin` header (same-origin GETs, the CLI, agents) is untouched.
 * Credentials are allowed only for an allowlisted origin. Entries that are not
 * http(s) origins (wildcard patterns, app schemes) are not CORS origins and are skipped.
 */

export type CorsAllowlist = ReadonlySet<string>;

const ALLOW_METHODS = "GET, HEAD, PUT, POST, DELETE, PATCH, OPTIONS";

/** Seconds a browser may cache a preflight answer. */
const PREFLIGHT_MAX_AGE = "600";

/** The exact `Origin` strings the entries stand for (`https://app.example`, no path). */
export function corsAllowlist(entries: readonly string[]): CorsAllowlist {
  const origins = new Set<string>();
  for (const entry of entries) {
    if (entry.includes("*")) continue;
    try {
      const url = new URL(entry);
      if (url.protocol === "http:" || url.protocol === "https:") {
        origins.add(url.origin);
      }
    } catch {
      // not a URL: not an origin
    }
  }
  return origins;
}

let configured: CorsAllowlist | undefined;

/** The allowlist of this install: Better Auth's trusted origins, read once. */
export async function configuredCorsAllowlist(): Promise<CorsAllowlist> {
  if (configured === undefined) {
    const { configuredTrustedOrigins } = await import("@watchdog/auth/server");
    configured = corsAllowlist(configuredTrustedOrigins());
  }
  return configured;
}

/** A header name is letters, digits and hyphens; anything else in the requested list is dropped, not echoed. */
const HEADER_NAME = /^[A-Za-z0-9-]+$/;

function allowedRequestHeaders(requested: string | null): string {
  if (requested === null) return "";
  return requested
    .split(",")
    .map((name) => name.trim())
    .filter((name) => HEADER_NAME.test(name))
    .join(", ");
}

function appendVaryOrigin(headers: Headers): void {
  const vary = headers.get("Vary");
  if (!vary?.split(",").some((v) => v.trim().toLowerCase() === "origin")) {
    headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  }
}

function allowedOrigin(
  request: Request,
  allowlist: CorsAllowlist
): string | null {
  const origin = request.headers.get("Origin");
  return origin !== null && allowlist.has(origin) ? origin : null;
}

/** The response with CORS headers for an allowlisted `Origin`; every other response is returned as is. */
export function withCors(
  request: Request,
  response: Response,
  allowlist: CorsAllowlist
): Response {
  if (!request.headers.has("Origin")) return response;
  const origin = allowedOrigin(request, allowlist);
  const headers = new Headers(response.headers);
  appendVaryOrigin(headers);
  if (origin !== null) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The answer to an `OPTIONS` request, or `null` for any other method. An allowlisted
 * origin gets the allow headers; any other origin gets a bare 204, which a browser
 * treats as a refused preflight.
 */
export function preflightResponse(
  request: Request,
  allowlist: CorsAllowlist
): Response | null {
  if (request.method !== "OPTIONS") return null;
  const headers = new Headers();
  if (request.headers.has("Origin")) appendVaryOrigin(headers);
  const origin = allowedOrigin(request, allowlist);
  if (origin !== null) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
    headers.set("Access-Control-Max-Age", PREFLIGHT_MAX_AGE);
    const requested = allowedRequestHeaders(
      request.headers.get("Access-Control-Request-Headers")
    );
    if (requested !== "")
      headers.set("Access-Control-Allow-Headers", requested);
  }
  return new Response(null, { status: 204, headers });
}

/** `withCors` against this install's allowlist. */
export async function applyWatchdogCors(
  request: Request,
  response: Response
): Promise<Response> {
  return withCors(request, response, await configuredCorsAllowlist());
}

/** `preflightResponse` against this install's allowlist. */
export async function corsPreflightResponse(
  request: Request
): Promise<Response | null> {
  return preflightResponse(request, await configuredCorsAllowlist());
}
