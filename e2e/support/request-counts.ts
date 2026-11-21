import type { Page, Request } from "@playwright/test";

/** A Better Auth endpoint (`/api/auth/get-session`, `/api/auth/organization/...`). */
export function isAuthRequest(url: string): boolean {
  return new URL(url).pathname.startsWith("/api/auth/");
}

/**
 * The route guard's organization-state call: `auth.whoami` through the browser's oRPC client
 * (`RPCLink` posts to `/api/rpc/<path>`).
 */
export function isOrganizationStateRequest(url: string): boolean {
  return new URL(url).pathname === "/api/rpc/auth/whoami";
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
