import { describe, expect, it } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import { corsAllowlist, preflightResponse, withCors } from "../api-cors.server";

const LISTED = "https://app.example.test";
const UNLISTED = "https://other.example.test";
const allowlist = corsAllowlist([LISTED, `${testHttpOrigin("localhost")}/`]);

function apiRequest(origin: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (origin !== null) headers.set("Origin", origin);
  return new Request(testHttpOrigin("api.example.test", "/api/v1/cases"), {
    ...init,
    headers,
  });
}

describe("corsAllowlist", () => {
  it("normalizes entries to bare origins", () => {
    expect([...corsAllowlist(["https://a.example.test/path?x=1"])]).toEqual([
      "https://a.example.test",
    ]);
  });

  it("skips wildcard patterns and entries that are not http(s) origins", () => {
    expect(
      corsAllowlist([
        "https://*.example.test",
        "myapp://callback",
        "not a url",
        "",
      ]).size
    ).toBe(0);
  });
});

describe("withCors", () => {
  it("adds CORS headers with credentials for a listed origin", () => {
    const response = withCors(
      apiRequest(LISTED),
      new Response("ok"),
      allowlist
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LISTED);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("adds no CORS headers for an unlisted origin", async () => {
    const response = withCors(
      apiRequest(UNLISTED),
      new Response("ok"),
      allowlist
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(await response.text()).toBe("ok");
  });

  it("never reflects the origin of a look-alike of a listed host", () => {
    const response = withCors(
      apiRequest("https://app.example.test.evil.test"),
      new Response("ok"),
      allowlist
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("leaves a request without an Origin header untouched", () => {
    const original = new Response("ok");

    const response = withCors(apiRequest(null), original, allowlist);

    expect(response).toBe(original);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("keeps an existing Vary value and appends Origin once", () => {
    const response = withCors(
      apiRequest(LISTED),
      new Response("ok", { headers: { Vary: "Accept-Encoding" } }),
      allowlist
    );

    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
  });
});

describe("preflightResponse", () => {
  it("returns null for a method that is not OPTIONS", () => {
    expect(preflightResponse(apiRequest(LISTED), allowlist)).toBeNull();
  });

  it("answers a listed origin with the allow headers", () => {
    const response = preflightResponse(
      apiRequest(LISTED, {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type, x-api-key",
        },
      }),
      allowlist
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(LISTED);
    expect(response?.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(response?.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
    expect(response?.headers.get("Access-Control-Allow-Headers")).toBe(
      "content-type, x-api-key"
    );
    expect(response?.headers.get("Access-Control-Max-Age")).not.toBeNull();
  });

  it("echoes only well-formed header names the browser asked for", () => {
    const response = preflightResponse(
      apiRequest(LISTED, {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Headers":
            "Content-Type, bad value, x-api-key, ;evil",
        },
      }),
      allowlist
    );

    expect(response?.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, x-api-key"
    );
  });

  it("answers an unlisted origin with a bare 204 and no CORS headers", () => {
    const response = preflightResponse(
      apiRequest(UNLISTED, {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      }),
      allowlist
    );

    expect(response?.status).toBe(204);
    for (const name of [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Credentials",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
    ]) {
      expect(response?.headers.get(name)).toBeNull();
    }
  });

  it("answers an OPTIONS request with no Origin without CORS headers", () => {
    const response = preflightResponse(
      apiRequest(null, { method: "OPTIONS" }),
      allowlist
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
