import { describe, expect, it } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import {
  CSP_REPORT_PATH,
  applySecurityHeaders,
  apiReferencePolicy,
  contentSecurityPolicy,
  createCspNonce,
  isApiReferenceRequest,
  nonceScriptTags,
  securityHeadersConfig,
  type SecurityHeadersConfig,
} from "../security-headers.server";

const NONCE = "bm9uY2UtZm9yLXRlc3Rz";
const S3_ORIGIN = testHttpOrigin("s3.example.test");

const production: SecurityHeadersConfig = {
  isProduction: true,
  s3Origin: S3_ORIGIN,
  isPublicUrlHttps: false,
};

function request(path = "/", init?: RequestInit): Request {
  return new Request(testHttpOrigin("watchdog.example.test", path), init);
}

function directiveOf(policy: string, name: string): string[] {
  const found = policy
    .split("; ")
    .map((part) => part.split(" "))
    .find(([directive]) => directive === name);
  return found === undefined ? [] : found.slice(1);
}

describe("createCspNonce", () => {
  it("returns a fresh base64 value of at least 128 bits each time", () => {
    const first = createCspNonce();
    const second = createCspNonce();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("securityHeadersConfig", () => {
  it("reads the store origin, the https public URL and the production flag from the env", () => {
    const config = securityHeadersConfig({
      NODE_ENV: "production",
      S3_ENDPOINT: "https://files.example.test/bucket-path",
      BETTER_AUTH_URL: "https://watchdog.example.test",
    });

    expect(config).toEqual({
      isProduction: true,
      s3Origin: "https://files.example.test",
      isPublicUrlHttps: true,
    });
  });

  it("follows S3_PUBLIC_URL, the address browsers use, instead of the internal S3_ENDPOINT", () => {
    const config = securityHeadersConfig({
      NODE_ENV: "production",
      S3_ENDPOINT: "http://s3:8333",
      S3_PUBLIC_URL: "https://files.example.test/some/path",
      BETTER_AUTH_URL: "https://watchdog.example.test",
    });

    expect(config.s3Origin).toBe("https://files.example.test");
  });

  it("falls back to S3_ENDPOINT when S3_PUBLIC_URL is not set", () => {
    const config = securityHeadersConfig({
      NODE_ENV: "production",
      S3_ENDPOINT: "https://files.example.test",
      S3_PUBLIC_URL: undefined,
      BETTER_AUTH_URL: "https://watchdog.example.test",
    });

    expect(config.s3Origin).toBe("https://files.example.test");
  });

  it("treats a development install on http as non-production without https", () => {
    const config = securityHeadersConfig({
      NODE_ENV: "development",
      S3_ENDPOINT: "http://127.0.0.1:9100",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
    });

    expect(config).toEqual({
      isProduction: false,
      s3Origin: "http://127.0.0.1:9100",
      isPublicUrlHttps: false,
    });
  });
});

describe("contentSecurityPolicy", () => {
  const policy = contentSecurityPolicy(NONCE, production);

  it("falls back to same-origin and closes plugins, framing and base rewriting", () => {
    expect(directiveOf(policy, "default-src")).toEqual(["'self'"]);
    expect(directiveOf(policy, "object-src")).toEqual(["'none'"]);
    expect(directiveOf(policy, "base-uri")).toEqual(["'self'"]);
    expect(directiveOf(policy, "form-action")).toEqual(["'self'"]);
    expect(directiveOf(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directiveOf(policy, "frame-src")).toEqual(["'none'"]);
  });

  it("allows scripts only from the app and the request nonce, never inline or eval", () => {
    const scripts = directiveOf(policy, "script-src");

    expect(scripts).toEqual([
      "'self'",
      `'nonce-${NONCE}'`,
      "'wasm-unsafe-eval'",
    ]);
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows style elements only with the nonce in production", () => {
    expect(directiveOf(policy, "style-src")).toEqual([
      "'self'",
      `'nonce-${NONCE}'`,
    ]);
    expect(directiveOf(policy, "style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("lets the browser reach the object store for uploads and previews and nothing else", () => {
    expect(directiveOf(policy, "connect-src")).toEqual(["'self'", S3_ORIGIN]);
    expect(directiveOf(policy, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      S3_ORIGIN,
    ]);
    expect(directiveOf(policy, "media-src")).toEqual(["'none'"]);
  });

  it("sends violation reports to the report endpoint", () => {
    expect(directiveOf(policy, "report-uri")).toEqual([CSP_REPORT_PATH]);
    expect(directiveOf(policy, "report-to")).toEqual(["csp"]);
  });

  it("omits the store origin when none is configured", () => {
    const bare = contentSecurityPolicy(NONCE, {
      ...production,
      s3Origin: null,
    });

    expect(directiveOf(bare, "connect-src")).toEqual(["'self'"]);
  });

  it("allows what the Vite dev server needs only outside production", () => {
    const dev = contentSecurityPolicy(NONCE, {
      ...production,
      isProduction: false,
    });

    expect(directiveOf(dev, "style-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
    expect(directiveOf(dev, "connect-src")).toContain("ws:");
    expect(directiveOf(policy, "connect-src")).not.toContain("ws:");
  });
});

describe("applySecurityHeaders", () => {
  async function headersFor(
    req: Request,
    config: SecurityHeadersConfig = production,
    response: Response = new Response("ok")
  ): Promise<Headers> {
    return (
      await applySecurityHeaders(response, {
        request: req,
        nonce: NONCE,
        config,
      })
    ).headers;
  }

  it("sets the full header set on an HTML response", async () => {
    const headers = await headersFor(
      request("/", { headers: { Accept: "text/html" } })
    );

    expect(headers.get("Content-Security-Policy")).toBe(
      contentSecurityPolicy(NONCE, production)
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Reporting-Endpoints")).toBe(`csp="${CSP_REPORT_PATH}"`);
    const permissions = headers.get("Permissions-Policy") ?? "";
    for (const feature of [
      "camera",
      "microphone",
      "geolocation",
      "payment",
      "usb",
    ]) {
      expect(permissions).toContain(`${feature}=()`);
    }
  });

  it("sets the same headers on an API response", async () => {
    const headers = await headersFor(
      request("/api/v1/cases"),
      production,
      Response.json({ items: [] })
    );

    expect(headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'"
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("content-type")).toContain("application/json");
  });

  it("keeps status, body and existing headers", async () => {
    const original = new Response("created", {
      status: 201,
      headers: { "X-Custom": "kept" },
    });

    const result = await applySecurityHeaders(original, {
      request: request("/api/v1/cases", { method: "POST" }),
      nonce: NONCE,
      config: production,
    });

    expect(result.status).toBe(201);
    expect(await result.text()).toBe("created");
    expect(result.headers.get("X-Custom")).toBe("kept");
  });

  it("sets headers on a response whose headers are immutable", async () => {
    const redirect = Response.redirect(
      testHttpOrigin("watchdog.example.test", "/next"),
      302
    );

    const result = await applySecurityHeaders(redirect, {
      request: request("/"),
      nonce: NONCE,
      config: production,
    });

    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe(
      testHttpOrigin("watchdog.example.test", "/next")
    );
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sends HSTS when the configured public URL is https", async () => {
    const headers = await headersFor(request("/"), {
      ...production,
      isPublicUrlHttps: true,
    });

    expect(headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("sends HSTS when the request itself is https", async () => {
    const headers = await headersFor(
      new Request("https://watchdog.example.test/")
    );

    expect(headers.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("does not send HSTS for plain http on an http install, whatever a client claims", async () => {
    const headers = await headersFor(
      request("/", { headers: { "X-Forwarded-Proto": "https" } })
    );

    expect(headers.has("Strict-Transport-Security")).toBe(false);
  });
});

describe("the API reference page", () => {
  const referenceHtml = `<!doctype html><html><head><title>API Reference</title></head><body><div id="app"></div><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script><script>const scalarConfig = {}</script></body></html>`;

  function referencePage(): Response {
    return new Response(referenceHtml, {
      headers: { "content-type": "text/html" },
    });
  }

  it("recognizes only GET /api/v1 and /api/v1/", () => {
    expect(isApiReferenceRequest(request("/api/v1"))).toBe(true);
    expect(isApiReferenceRequest(request("/api/v1/"))).toBe(true);
    expect(isApiReferenceRequest(request("/api/v1/cases"))).toBe(false);
    expect(isApiReferenceRequest(request("/api/v1", { method: "POST" }))).toBe(
      false
    );
    expect(isApiReferenceRequest(request("/"))).toBe(false);
  });

  it("gets its own policy: nonce and the pinned script host, no other origins", async () => {
    const result = await applySecurityHeaders(referencePage(), {
      request: request("/api/v1"),
      nonce: NONCE,
      config: production,
    });
    const policy = result.headers.get("Content-Security-Policy") ?? "";

    expect(policy).toBe(apiReferencePolicy(NONCE));
    expect(directiveOf(policy, "default-src")).toEqual(["'none'"]);
    expect(directiveOf(policy, "script-src")).toEqual([
      `'nonce-${NONCE}'`,
      "https://cdn.jsdelivr.net",
    ]);
    expect(directiveOf(policy, "connect-src")).toEqual(["'self'"]);
    expect(directiveOf(policy, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("puts the nonce on every script tag of the page", async () => {
    const result = await applySecurityHeaders(referencePage(), {
      request: request("/api/v1"),
      nonce: NONCE,
      config: production,
    });
    const html = await result.text();

    const tags = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toContain(`nonce="${NONCE}"`);
  });

  it("leaves other /api/v1 responses on the page policy", async () => {
    const result = await applySecurityHeaders(Response.json({ ok: true }), {
      request: request("/api/v1/spec.json"),
      nonce: NONCE,
      config: production,
    });

    expect(result.headers.get("Content-Security-Policy")).toBe(
      contentSecurityPolicy(NONCE, production)
    );
  });
});

describe("nonceScriptTags", () => {
  it("also covers upper-case tags", () => {
    expect(nonceScriptTags("<SCRIPT>a()</SCRIPT>", NONCE)).toBe(
      `<SCRIPT nonce="${NONCE}">a()</SCRIPT>`
    );
  });

  it("adds the nonce to every script opening tag and nothing else", () => {
    const out = nonceScriptTags(
      '<p>x</p><script>a()</script><script src="/b.js"></script>',
      NONCE
    );

    expect(out).toBe(
      `<p>x</p><script nonce="${NONCE}">a()</script><script nonce="${NONCE}" src="/b.js"></script>`
    );
  });
});
