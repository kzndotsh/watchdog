import type { Page, Request } from "@playwright/test";

/** A Better Auth endpoint (`/api/auth/get-session`, `/api/auth/organization/...`). */
export function isAuthRequest(url: string): boolean {
  return new URL(url).pathname.startsWith("/api/auth/");
}

const SERVER_FN_PREFIX = "/_serverFn/";

/**
 * The export name of a server function request. In `vite dev` (what the e2e server runs) the
 * id after `/_serverFn/` is base64url JSON `{ file, export }`; a production build hashes it
 * (then this returns `null`, and only the auth endpoints are counted).
 */
export function serverFnName(url: string): string | null {
  const { pathname } = new URL(url);
  if (!pathname.startsWith(SERVER_FN_PREFIX)) return null;
  const id = pathname.slice(SERVER_FN_PREFIX.length);
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(id, "base64url").toString("utf-8")
    );
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "export" in decoded &&
      typeof decoded.export === "string"
    ) {
      return decoded.export;
    }
  } catch {
    // not base64 JSON: a hashed production id
  }
  return null;
}

/** The route guard's organization-state server function (`getOrganizationStateFn`). */
export function isOrganizationStateRequest(url: string): boolean {
  return serverFnName(url)?.startsWith("getOrganizationStateFn") ?? false;
}

/** A request the protected route guard is allowed to make at most once per session lifetime. */
export function isGateRequest(url: string): boolean {
  return isAuthRequest(url) || isOrganizationStateRequest(url);
}

/** Records every auth or organization-state request the page makes until `stop()`. */
export function recordGateRequests(page: Page): {
  readonly urls: string[];
  stop: () => void;
} {
  const urls: string[] = [];
  const onRequest = (request: Request) => {
    if (isGateRequest(request.url())) urls.push(request.url());
  };
  page.on("request", onRequest);
  return {
    urls,
    stop: () => {
      page.off("request", onRequest);
    },
  };
}
