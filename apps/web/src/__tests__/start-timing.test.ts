import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const state = vi.hoisted(() => ({
  nodeEnv: "test",
  config: null as {
    requestMiddleware: Handler[];
  } | null,
  /** Wide-event context of every request/function event that was emitted. */
  events: [] as Record<string, unknown>[],
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: vi.fn(() => ({
    server: (handler: unknown) => handler,
  })),
  createStart: vi.fn((factory: () => typeof state.config) => {
    state.config = factory();
    return state.config;
  }),
}));

vi.mock("./evlog-init.server", () => ({}));

vi.mock("@watchdog/server/env/server", () => ({
  get env() {
    return { NODE_ENV: state.nodeEnv };
  },
  errorReportingSettings: () => ({ dsn: undefined }),
  otlpSettings: () => ({ endpoint: undefined }),
  startupWarnings: () => [],
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

vi.mock("@watchdog/server/log", async (importActual) => {
  const actual = await importActual<typeof import("@watchdog/server/log")>();
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

import { timedDbCall } from "@watchdog/server/log";
import "@/start";

// requestMiddleware: [securityHeaders, evlog]
const [, requestMiddleware] = state.config?.requestMiddleware ?? [];

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
});
