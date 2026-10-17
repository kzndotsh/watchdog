import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

const { handleMock, OpenAPIHandler } = vi.hoisted(() => {
  const handleMock = vi.fn();
  class OpenAPIHandler {
    handle = handleMock;
  }
  return { handleMock, OpenAPIHandler };
});

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ actorId: "test-actor" })
);

vi.mock("@orpc/openapi/fetch", () => ({
  OpenAPIHandler,
}));

vi.mock("@orpc/openapi/plugins", () => ({
  OpenAPIReferencePlugin: vi.fn(),
}));

vi.mock("@orpc/json-schema", () => ({
  SmartCoercionPlugin: vi.fn(),
}));

vi.mock("@orpc/zod/zod4", () => ({
  ZodToJsonSchemaConverter: vi.fn(),
}));

vi.mock("@watchdog/auth/server", () => ({
  configuredTrustedOrigins: () => [
    "https://app.example.test",
    "https://admin.example.test",
  ],
}));

vi.mock("@watchdog/api", () => ({
  router: {},
  openApiSpecGenerateOptions: () => ({}),
}));

vi.mock("@/auth/api-context.server", () => ({
  createApiContext: createApiContextMock,
}));

import { handleOpenApiRequest } from "@/lib/openapi-handler.server";

describe("handleOpenApiRequest", () => {
  it("returns the OpenAPI handler response when a route matches", async () => {
    handleMock.mockResolvedValue({
      matched: true,
      response: new Response("ok", { status: 200 }),
    });

    const response = await handleOpenApiRequest(
      new Request(testHttpOrigin("localhost", "/api/v1/health"))
    );

    expect(createApiContextMock).toHaveBeenCalled();
    expect(handleMock).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        prefix: "/api/v1",
        context: { actorId: "test-actor" },
      })
    );
    expect(await response.text()).toBe("ok");
    expect(response.status).toBe(200);
  });

  it("returns 404 when the OpenAPI handler does not match", async () => {
    handleMock.mockResolvedValue({
      matched: false,
      response: null,
    });

    const response = await handleOpenApiRequest(
      new Request(testHttpOrigin("localhost", "/api/v1/missing"))
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  describe("cross-origin access", () => {
    const LISTED = "https://app.example.test";
    const UNLISTED = "https://other.example.test";

    function apiRequest(origin: string, method = "GET"): Request {
      return new Request(testHttpOrigin("localhost", "/api/v1/health"), {
        method,
        headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      });
    }

    it("sends CORS headers with credentials to a trusted origin", async () => {
      handleMock.mockResolvedValue({
        matched: true,
        response: new Response("ok"),
      });

      const response = await handleOpenApiRequest(apiRequest(LISTED));

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LISTED);
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true"
      );
    });

    it("sends no CORS headers to an origin that is not trusted", async () => {
      handleMock.mockResolvedValue({
        matched: true,
        response: new Response("ok"),
      });

      const response = await handleOpenApiRequest(apiRequest(UNLISTED));

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(
        response.headers.get("Access-Control-Allow-Credentials")
      ).toBeNull();
    });

    it("sends no CORS headers on a 404 for an origin that is not trusted", async () => {
      handleMock.mockResolvedValue({ matched: false, response: null });

      const response = await handleOpenApiRequest(apiRequest(UNLISTED));

      expect(response.status).toBe(404);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("answers a trusted origin's preflight with the allow headers", async () => {
      handleMock.mockClear();

      const response = await handleOpenApiRequest(
        apiRequest(LISTED, "OPTIONS")
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LISTED);
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST"
      );
      expect(handleMock).not.toHaveBeenCalled();
    });

    it("answers an untrusted origin's preflight without CORS headers", async () => {
      handleMock.mockClear();

      const response = await handleOpenApiRequest(
        apiRequest(UNLISTED, "OPTIONS")
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull();
      expect(handleMock).not.toHaveBeenCalled();
    });
  });
});
