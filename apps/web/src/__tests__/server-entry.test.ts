import { beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_BODY_MAX_BYTES } from "@watchdog/schemas/shared";
import { testHttpOrigin } from "@watchdog/test-kit";

const handlerFetch = vi.hoisted(() =>
  vi.fn(async (_request: Request) => new Response("handled"))
);

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: handlerFetch },
  createServerEntry: <T>(entry: T): T => entry,
}));

const TRUSTED = "https://app.example.test";

vi.mock("@watchdog/env/server", () => ({
  env: {
    NODE_ENV: "production",
    S3_ENDPOINT: "https://s3.example.test",
    BETTER_AUTH_URL: "https://watchdog.example.test",
  },
}));

vi.mock("@watchdog/auth/server", () => ({
  configuredTrustedOrigins: () => [TRUSTED],
}));

import entry from "../server";

const post = (path: string, length: number) =>
  new Request(testHttpOrigin("watchdog.example.test", path), {
    method: "POST",
    body: "x",
    headers: { "content-length": String(length), Origin: TRUSTED },
  });

describe("server entry", () => {
  beforeEach(() => {
    handlerFetch.mockClear();
  });

  it("hands a request within the limit to the Start handler", async () => {
    const response = await entry.fetch(
      post("/api/v1/cases", REQUEST_BODY_MAX_BYTES)
    );
    expect(await response.text()).toBe("handled");
    expect(handlerFetch).toHaveBeenCalledTimes(1);
  });

  it("answers an oversized API body 413 with security headers and CORS, never reaching the handler", async () => {
    const response = await entry.fetch(
      post("/api/v1/cases", REQUEST_BODY_MAX_BYTES + 1)
    );
    expect(response.status).toBe(413);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).not.toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBe(TRUSTED);
    expect(handlerFetch).not.toHaveBeenCalled();
  });

  it("answers an oversized body on any other route 413 without CORS", async () => {
    const responses = await Promise.all(
      ["/api/auth/sign-in/email", "/_serverFn/abc"].map(async (path) =>
        entry.fetch(post(path, REQUEST_BODY_MAX_BYTES + 1))
      )
    );
    for (const response of responses) {
      expect(response.status).toBe(413);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect(handlerFetch).not.toHaveBeenCalled();
  });
});
