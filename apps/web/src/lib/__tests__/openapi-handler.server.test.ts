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

vi.mock("@/lib/api-cors.server", () => ({
  watchdogCorsPlugin: {},
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
});
