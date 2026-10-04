import { Data, Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin, testId } from "@watchdog/test-kit";

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string;
}> {}

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ actor: null })
);
const corsPreflightResponseMock = vi.hoisted(() => vi.fn());
const applyWatchdogCorsMock = vi.hoisted(() =>
  vi.fn((_request: Request, response: Response) => response)
);
const listenForEventsMock = vi.hoisted(() => vi.fn());
const assertCaseInOrgEffectMock = vi.hoisted(() => vi.fn());
const listVisibleCaseIdsEffectMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());
const logSetMock = vi.hoisted(() => vi.fn());
const logEmitMock = vi.hoisted(() => vi.fn());
const createLoggerMock = vi.hoisted(() =>
  vi.fn(() => ({ error: logErrorMock, set: logSetMock, emit: logEmitMock }))
);

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

vi.mock("@watchdog/api", () => ({
  runApp: (effect: Effect.Effect<unknown>) => Effect.runPromise(effect),
}));

vi.mock("@watchdog/core/graph", () => ({
  assertCaseInOrgEffect: assertCaseInOrgEffectMock,
}));

vi.mock("@watchdog/core/cases", () => ({
  listVisibleCaseIdsEffect: listVisibleCaseIdsEffectMock,
}));

vi.mock("@watchdog/core/events", () => ({
  listenForEvents: listenForEventsMock,
}));

vi.mock("@watchdog/log", () => ({ createLogger: createLoggerMock }));

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
    assertCaseInOrgEffectMock.mockReturnValue(Effect.succeed(caseId));
    listVisibleCaseIdsEffectMock.mockReturnValue(Effect.succeed([caseId]));
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
    expect(assertCaseInOrgEffectMock).toHaveBeenCalledWith(caseId, "org-1");
    await response.body?.cancel();
  });

  it("closes the stream when the actor loses the organization mid-stream", async () => {
    vi.useFakeTimers();
    try {
      const actor = {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      };
      createApiContextMock.mockResolvedValue({ actor });
      const end = vi.fn();
      listenForEventsMock.mockReturnValue({ end });
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

      // Removed from the organization: the next beat must end the stream.
      createApiContextMock.mockResolvedValue({ actor: null });
      await vi.advanceTimersByTimeAsync(25_000);

      expect(end).toHaveBeenCalled();
      await response.body?.cancel();
    } finally {
      vi.useRealTimers();
      createApiContextMock.mockResolvedValue({ actor: null });
    }
  });

  it("returns 404 when core reports the Case as not visible to the organization", async () => {
    const caseId = testId(11);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    assertCaseInOrgEffectMock.mockReturnValue(
      Effect.fail(new NotFoundError({ resource: "Case not found" }))
    );
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
        testHttpOrigin("localhost", `/api/events?caseId=${caseId}`)
      ),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("does not deliver events for a Case core no longer lists as visible", async () => {
    const hiddenCaseId = testId(12);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    listVisibleCaseIdsEffectMock.mockReturnValue(Effect.succeed([]));
    let onMessage: ((raw: string) => void) | undefined;
    listenForEventsMock.mockImplementation(
      (cb: (raw: string) => void, onReady?: () => void) => {
        onMessage = cb;
        onReady?.();
        return { end: vi.fn() };
      }
    );
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
    onMessage?.(
      JSON.stringify({ type: "entity_changed", caseId: hiddenCaseId })
    );
    // let the allowed-set refresh through core settle
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const reader = response.body?.getReader();
    const first = await reader?.read();
    const text = new TextDecoder().decode(first?.value);
    expect(text).toContain("connected");
    expect(text).not.toContain("entity_changed");
    await reader?.cancel();
  });

  it("drops the event and logs when the visibility read fails", async () => {
    const caseId = testId(13);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    listVisibleCaseIdsEffectMock
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.die(new Error("pool exhausted")));
    let onMessage: ((raw: string) => void) | undefined;
    listenForEventsMock.mockImplementation(
      (cb: (raw: string) => void, onReady?: () => void) => {
        onMessage = cb;
        onReady?.();
        return { end: vi.fn() };
      }
    );
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
    onMessage?.(JSON.stringify({ type: "entity_changed", caseId }));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(logEmitMock).toHaveBeenCalled();
    // no Case id (or payload) goes into the log context
    expect(JSON.stringify(createLoggerMock.mock.calls)).not.toContain(caseId);
    const reader = response.body?.getReader();
    const first = await reader?.read();
    const text = new TextDecoder().decode(first?.value);
    expect(text).toContain("connected");
    expect(text).not.toContain("entity_changed");
    await reader?.cancel();
  });
});
