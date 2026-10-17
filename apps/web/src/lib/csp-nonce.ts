import { getGlobalStartContext } from "@tanstack/react-start";

/** The meta tag TanStack Start renders when the router has a nonce. */
const NONCE_META = 'meta[property="csp-nonce"]';

/**
 * The CSP nonce of this request, for `createRouter({ ssr: { nonce } })`.
 *
 * On the server it is the nonce the security-headers middleware put in the
 * request context (`start.ts`); in the browser it is the one the server
 * rendered into the page, so hydration renders the same nonce attributes.
 * Without a Start request (a prerender, a test) there is none.
 */
export function requestCspNonce(): string | undefined {
  if (typeof document !== "undefined") {
    return (
      document.querySelector(NONCE_META)?.getAttribute("content") ?? undefined
    );
  }
  try {
    // Start types this context from its own registry, which the app does not declare.
    const context: unknown = getGlobalStartContext();
    if (
      typeof context === "object" &&
      context !== null &&
      "cspNonce" in context &&
      typeof context.cspNonce === "string"
    ) {
      return context.cspNonce;
    }
  } catch {
    // Called outside a request (before the global middleware ran): no nonce.
  }
  return undefined;
}
