import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ actor: null })
);
const corsPreflightResponseMock = vi.hoisted(() => vi.fn());
const applyWatchdogCorsMock = vi.hoisted(() =>
  vi.fn((_request: Request, response: Response) => response)
);
const listenForEventsMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/auth/api-context.server", () => ({
  createApiContext: createApiContextMock,
}));

vi.mock("@/lib/api-cors.server", () => ({
  applyWatchdogCors: applyWatchdogCorsMock,
  corsPreflightResponse: corsPreflightResponseMock,
}));

vi.mock("@watchdog/db", () => ({
  isWatchdogEvent: () => true,
  listenForEvents: listenForEventsMock,
  casesRepo: {
    getById: vi.fn(),
    listIds: vi.fn(async () => []),
  },
  db: {},
}));

import { Route } from "@/routes/api/events";

describe("api events route", () => {
  it("returns a cors preflight response for OPTIONS when configured", async () => {
    const preflight = new Response(null, { status: 204 });
    corsPreflightResponseMock.mockReturnValue(preflight);
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.OPTIONS({
      request: new Request(testHttpOrigin("localhost", "/api/events"), {
        method: "OPTIONS",
      }),
    });

    expect(response).toBe(preflight);
  });

  it("returns 401 when the request is unauthenticated", async () => {
    createApiContextMock.mockResolvedValue({ actor: null });
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(testHttpOrigin("localhost", "/api/events")),
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
  });

  it("returns 403 when the actor has no organization", async () => {
    createApiContextMock.mockResolvedValue({
      actor: { userId: "u1", email: null, name: null, organizationId: null },
    });
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(testHttpOrigin("localhost", "/api/events")),
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });
});
