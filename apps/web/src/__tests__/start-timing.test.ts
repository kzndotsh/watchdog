import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const state = vi.hoisted(() => ({
  nodeEnv: "test",
  config: null as {
    requestMiddleware: Handler[];
    functionMiddleware: Handler[];
  } | null,
  /** Wide-event context of every request/function event that was emitted. */
  events: [] as Record<string, unknown>[],
  headerCalls: [] as [string, string][],
}));

vi.mock("@tanstack/react-start", () => ({
  createCsrfMiddleware: vi.fn(() => "csrf-middleware"),
  createMiddleware: vi.fn(() => ({
    server: (handler: unknown) => handler,
  })),
  createStart: vi.fn((factory: () => typeof state.config) => {
    state.config = factory();
    return state.config;
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: vi.fn((name: string, value: string) => {
    state.headerCalls.push([name, value]);
  }),
}));

vi.mock("@/auth/middleware", () => ({ requireAuth: "require-auth" }));
vi.mock("@/auth/unauthorized-error", () => ({
  isUnauthorizedError: vi.fn(() => false),
}));
vi.mock("./evlog-init.server", () => ({}));

vi.mock("@watchdog/env/server", () => ({
  get env() {
    return { NODE_ENV: state.nodeEnv };
  },
}));

vi.mock("evlog/toolkit", async () => {
  const { createLogger } = await import("evlog");
  return {
    extractSafeHeaders: () => ({}),
    createMiddlewareLogger: ({ path }: { path: string }) => {
      const logger = createLogger({ path });
      return {
        logger,
        skipped: !path.startsWith("/api/"),
        finish: async () => {
          state.events.push(logger.getContext());
        },
        finishResponse: async (response: Response) => {
          state.events.push(logger.getContext());
          return response;
        },
      };
    },
  };
});

vi.mock("@watchdog/log", async (importActual) => {
  const actual = await importActual<typeof import("@watchdog/log")>();
  return {
    ...actual,
    // Capture what a server-function wide event carries when it is emitted.
    createLogger: (...args: Parameters<typeof actual.createLogger>) => {
      const logger = actual.createLogger(...args);
      logger.emit = vi.fn(() => {
        state.events.push(logger.getContext());
        return null;
      });
      return logger;
    },
  };
});

import { timedDbCall } from "@watchdog/log";
import "@/start";

const [requestMiddleware] = state.config?.requestMiddleware ?? [];
const [functionMiddleware] = state.config?.functionMiddleware ?? [];

/** A handler that runs `n` database calls through the seam core's `tryDb` uses. */
function nextWithDbCalls(n: number, response = new Response("ok")) {
  return async () => {
    await Promise.all(
      Array.from({ length: n }, () => timedDbCall(async () => undefined))
    );
    return { response, context: {} };
  };
}

function runRequest(path: string, next: () => Promise<unknown>) {
  return requestMiddleware!({
    next,
    request: new Request(`http://localhost${path}`),
    pathname: path,
  }) as Promise<{ response: Response }>;
}

describe("request timing in the wide event", () => {
  beforeEach(() => {
    state.nodeEnv = "test";
    state.events.length = 0;
    state.headerCalls.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs durationMs, db.queries and db.ms for an API route", async () => {
    await runRequest("/api/v1/cases", nextWithDbCalls(3));
    expect(state.events).toHaveLength(1);
    const event = state.events[0]!;
    expect(event.db).toEqual({ queries: 3, ms: expect.any(Number) });
    expect(event.durationMs).toEqual(expect.any(Number));
  });

  it("logs the same fields for a server function (not skipped any more)", async () => {
    await functionMiddleware!({
      next: nextWithDbCalls(4),
      serverFnMeta: { id: "listCases" },
    });
    expect(state.events).toHaveLength(1);
    const event = state.events[0]!;
    expect(event.operation).toBe("listCases");
    expect(event.db).toEqual({ queries: 4, ms: expect.any(Number) });
    expect(event.durationMs).toEqual(expect.any(Number));
  });

  it("keeps a failed server function's timing on its event", async () => {
    await expect(
      functionMiddleware!({
        next: async () => {
          await timedDbCall(async () => undefined);
          throw new Error("boom");
        },
        serverFnMeta: { id: "failing" },
      })
    ).rejects.toThrow("boom");
    expect(state.events[0]!.db).toMatchObject({ queries: 1 });
  });

  it("logs no SQL, rows or bodies: only the timing keys are added", async () => {
    await runRequest("/api/v1/cases", nextWithDbCalls(1));
    const event = state.events[0]!;
    expect(new Set(Object.keys(event))).toEqual(
      new Set(["db", "durationMs", "path"])
    );
    expect(new Set(Object.keys(event.db as object))).toEqual(
      new Set(["ms", "queries"])
    );
  });
});

describe("Server-Timing header", () => {
  beforeEach(() => {
    state.events.length = 0;
    state.headerCalls.length = 0;
  });

  it.each(["test", "development"])(
    "is set on API responses in %s",
    async (nodeEnv) => {
      state.nodeEnv = nodeEnv;
      const { response } = await runRequest(
        "/api/v1/cases",
        nextWithDbCalls(2)
      );
      expect(response.headers.get("Server-Timing")).toMatch(
        /^db;dur=[\d.]+, app;dur=[\d.]+$/
      );
    }
  );

  it("is absent on API responses in production", async () => {
    state.nodeEnv = "production";
    const { response } = await runRequest("/api/v1/cases", nextWithDbCalls(2));
    expect(response.headers.has("Server-Timing")).toBe(false);
    // The log fields stay on in production: only the header is gated.
    expect(state.events[0]!.db).toMatchObject({ queries: 2 });
  });

  it("is set for server functions in test and absent in production", async () => {
    state.nodeEnv = "test";
    await functionMiddleware!({
      next: nextWithDbCalls(1),
      serverFnMeta: { id: "fn" },
    });
    expect(state.headerCalls).toHaveLength(1);
    expect(state.headerCalls[0]![0]).toBe("Server-Timing");
    expect(state.headerCalls[0]![1]).toMatch(/^db;dur=[\d.]+, app;dur=[\d.]+$/);

    state.headerCalls.length = 0;
    state.nodeEnv = "production";
    await functionMiddleware!({
      next: nextWithDbCalls(1),
      serverFnMeta: { id: "fn" },
    });
    expect(state.headerCalls).toHaveLength(0);
  });
});
