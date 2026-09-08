import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin, testId } from "@watchdog/test-kit";

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ actor: null })
);
const corsPreflightResponseMock = vi.hoisted(() => vi.fn());
const applyWatchdogCorsMock = vi.hoisted(() =>
  vi.fn((_request: Request, response: Response) => response)
);
const listenForEventsMock = vi.hoisted(() => vi.fn());
const casesRepoMock = vi.hoisted(() => ({
  getById: vi.fn(),
  listIds: vi.fn(async () => []),
}));

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
  casesRepo: casesRepoMock,
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

  it("returns 400 when caseId is whitespace-only", async () => {
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
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
      request: new Request(
        testHttpOrigin("localhost", "/api/events?caseId=%20%20")
      ),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
  });

  it("returns 400 when caseId is not a valid uuid", async () => {
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
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
      request: new Request(
        testHttpOrigin("localhost", "/api/events?caseId=not-a-uuid")
      ),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
  });

  it("trims padded caseId before scoped lookup", async () => {
    const caseId = testId(10);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    vi.mocked(casesRepoMock.getById).mockResolvedValue({
      id: caseId,
      organizationId: "org-1",
      name: "Case",
      slug: "case",
      description: null,
      allowThirdPartyEgress: false,
    });
    listenForEventsMock.mockReturnValue({ end: vi.fn() });
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
      request: new Request(
        testHttpOrigin("localhost", `/api/events?caseId=%20${caseId}%20`)
      ),
    });

    expect(response.status).toBe(200);
    expect(casesRepoMock.getById).toHaveBeenCalledWith({}, caseId, "org-1");
    await response.body?.cancel();
  });
});
