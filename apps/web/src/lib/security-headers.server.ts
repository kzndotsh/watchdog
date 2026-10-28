import "@tanstack/react-start/server-only";

/**
 * Browser security headers for every response (HTML, API, SSE, file routes).
 *
 * One module owns the policy: `start.ts` installs it as a request middleware,
 * and everything here is a pure function of the request, the response and a
 * small config, so the header values are unit-tested directly.
 *
 * Scripts are nonce-based: the middleware mints a nonce per request, passes it
 * to the router (`router.options.ssr.nonce`, which TanStack Start puts on every
 * hydration and head script) and names it in `script-src`. The nonce is
 * derived from a CSPRNG and never reused.
 *
 * Operator reference: docs/how-to/self-host.md (Security headers).
 */

/** Where browsers post CSP violation reports (`routes/api/csp-report.ts`). */
export const CSP_REPORT_PATH = "/api/csp-report";

const REPORT_GROUP = "csp";

/** HSTS lifetime: one year. `includeSubDomains` and `preload` are left to the operator's proxy. */
const HSTS_VALUE = "max-age=31536000";

const API_REFERENCE_SCRIPT_ORIGIN = "https://cdn.jsdelivr.net";

/** Features the app never uses, switched off for the page and every frame in it. */
const PERMISSIONS_POLICY = [
  "accelerometer",
  "autoplay",
  "bluetooth",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "hid",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "serial",
  "usb",
  "xr-spatial-tracking",
]
  .map((feature) => `${feature}=()`)
  .join(", ");

export type SecurityHeadersConfig = {
  /** Production builds only: development adds what Vite's dev server needs. */
  isProduction: boolean;
  /** Origin of the object store the browser talks to (presigned uploads and downloads). */
  s3Origin: string | null;
  /** The configured public URL (`BETTER_AUTH_URL`) is https, so HSTS applies behind a TLS proxy. */
  isPublicUrlHttps: boolean;
};

export type SecurityHeadersEnv = {
  NODE_ENV: "development" | "production" | "test";
  S3_ENDPOINT: string;
  /** Where browsers reach the store, when it differs from `S3_ENDPOINT`. */
  S3_PUBLIC_URL?: string | undefined;
  BETTER_AUTH_URL: string;
};

function originOf(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export function securityHeadersConfig(
  env: SecurityHeadersEnv
): SecurityHeadersConfig {
  return {
    isProduction: env.NODE_ENV === "production",
    // The browser talks to the store at S3_PUBLIC_URL (presigned uploads and downloads) when it
    // is set, else at S3_ENDPOINT: the policy follows the address the browser uses.
    s3Origin: originOf(env.S3_PUBLIC_URL ?? env.S3_ENDPOINT),
    isPublicUrlHttps:
      originOf(env.BETTER_AUTH_URL)?.startsWith("https:") === true,
  };
}

/** A fresh 128-bit nonce, base64. One per request. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCodePoint(...bytes));
}

function directives(entries: Record<string, readonly string[]>): string {
  return Object.entries(entries)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

/**
 * The page policy.
 *
 * - `script-src`: same-origin chunks plus the request nonce. `'wasm-unsafe-eval'`
 *   lets Shiki's regex engine compile its WebAssembly module (Evidence code
 *   highlighting); it does not allow `eval()` or inline script.
 * - `style-src`: same-origin sheets plus the nonce for `<style>` elements (TanStack
 *   Start, Base UI). `style-src-attr 'unsafe-inline'` stays because server-rendered
 *   `style="..."` attributes carry computed layout (sidebar width, split-view and
 *   graph positions, table column widths); a style attribute cannot run script.
 *   Development uses `'unsafe-inline'` for `<style>` too, because Vite injects CSS
 *   at runtime without a nonce.
 * - `connect-src` / `img-src`: the app itself plus the object store, which the
 *   browser uploads to and reads previews from with presigned URLs.
 */
export function contentSecurityPolicy(
  nonce: string,
  config: SecurityHeadersConfig
): string {
  const store = config.s3Origin === null ? [] : [config.s3Origin];
  return directives({
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'wasm-unsafe-eval'"],
    "style-src": config.isProduction
      ? ["'self'", `'nonce-${nonce}'`]
      : ["'self'", "'unsafe-inline'"],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...store],
    "font-src": ["'self'", "data:"],
    "media-src": ["'none'"],
    "connect-src": [
      "'self'",
      ...store,
      ...(config.isProduction ? [] : ["ws:", "wss:"]),
    ],
    "frame-src": ["'none'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": [REPORT_GROUP],
  });
}

/**
 * The policy for the interactive API reference only (`GET /api/v1`). The page is
 * generated by oRPC: it loads the Scalar bundle from jsDelivr and renders the
 * spec with an inline script, and Scalar injects `<style>` elements at runtime
 * without a nonce. So this page alone allows the pinned script host and inline
 * styles; the inline script itself still needs the nonce, and the page can
 * reach only this origin.
 */
export function apiReferencePolicy(nonce: string): string {
  return directives({
    "default-src": ["'none'"],
    "script-src": [`'nonce-${nonce}'`, API_REFERENCE_SCRIPT_ORIGIN],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'none'"],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": [REPORT_GROUP],
  });
}

/** `GET /api/v1` and `/api/v1/` render the API reference page. */
export function isApiReferenceRequest(request: Request): boolean {
  if (request.method !== "GET") return false;
  const { pathname } = new URL(request.url);
  return pathname === "/api/v1" || pathname === "/api/v1/";
}

/** HSTS applies on an https request, or when the configured public URL is https (TLS proxy in front). */
function sendsHsts(request: Request, config: SecurityHeadersConfig): boolean {
  if (config.isPublicUrlHttps) return true;
  return new URL(request.url).protocol === "https:";
}

type SecurityHeaderInput = {
  request: Request;
  nonce: string;
  config: SecurityHeadersConfig;
  /** The response carries the API reference page. */
  isApiReference?: boolean;
};

/** The headers every response carries, as name/value pairs. */
export function securityHeaders({
  request,
  nonce,
  config,
  isApiReference = false,
}: SecurityHeaderInput): [string, string][] {
  const headers: [string, string][] = [
    [
      "Content-Security-Policy",
      isApiReference
        ? apiReferencePolicy(nonce)
        : contentSecurityPolicy(nonce, config),
    ],
    ["Reporting-Endpoints", `${REPORT_GROUP}="${CSP_REPORT_PATH}"`],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", PERMISSIONS_POLICY],
    ["Cross-Origin-Opener-Policy", "same-origin"],
  ];
  if (sendsHsts(request, config)) {
    headers.push(["Strict-Transport-Security", HSTS_VALUE]);
  }
  return headers;
}

/**
 * Put the nonce on every `<script>` of the generated API reference page. The
 * page comes from oRPC and its spec is JSON-escaped (`<` becomes `<`), so
 * a `<script` in the markup is always a real tag.
 */
export function nonceScriptTags(html: string, nonce: string): string {
  return html.replaceAll(/<script\b/gi, (tag) => `${tag} nonce="${nonce}"`);
}

function withHeaders(response: Response, pairs: [string, string][]): Response {
  try {
    for (const [name, value] of pairs) response.headers.set(name, value);
    return response;
  } catch {
    // Immutable headers (a Response.redirect or a fetched Response): copy, keep the body stream.
    const headers = new Headers(response.headers);
    for (const [name, value] of pairs) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

async function loadSecurityHeadersConfig(): Promise<SecurityHeadersConfig> {
  const { env } = await import("@watchdog/env/server");
  return securityHeadersConfig(env);
}

let resolvedConfig: Promise<SecurityHeadersConfig> | undefined;

/**
 * The config for this process, read once from the validated environment. The promise is what is
 * kept, so requests that arrive together share one read instead of racing to set it.
 */
export async function resolveSecurityHeadersConfig(): Promise<SecurityHeadersConfig> {
  resolvedConfig ??= loadSecurityHeadersConfig();
  return resolvedConfig;
}

/** Set the security headers on a response (rewriting the API reference page to carry the nonce). */
export async function applySecurityHeaders(
  response: Response,
  input: SecurityHeaderInput
): Promise<Response> {
  const isReferencePage =
    isApiReferenceRequest(input.request) &&
    response.status === 200 &&
    (response.headers.get("content-type") ?? "").includes("text/html");
  const pairs = securityHeaders({ ...input, isApiReference: isReferencePage });
  if (!isReferencePage) return withHeaders(response, pairs);

  const html = nonceScriptTags(await response.text(), input.nonce);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  for (const [name, value] of pairs) headers.set(name, value);
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
