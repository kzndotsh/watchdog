import { describe, expect, it, vi } from "vitest";

const startConfigRef = vi.hoisted(() => ({
  current: null as {
    requestMiddleware: unknown[];
    functionMiddleware: unknown[];
  } | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createCsrfMiddleware: vi.fn(() => "csrf-middleware"),
  createMiddleware: vi.fn(() => ({
    server: (handler: unknown) => handler,
  })),
  createStart: vi.fn((factory: () => typeof startConfigRef.current) => {
    startConfigRef.current = factory();
    return startConfigRef.current;
  }),
}));

vi.mock("@/auth/middleware", () => ({
  requireAuth: "require-auth",
}));

vi.mock("@/auth/unauthorized-error", () => ({
  isUnauthorizedError: vi.fn(),
}));

vi.mock("./evlog-init.server", () => ({}));

vi.mock("evlog/toolkit", () => ({
  createMiddlewareLogger: vi.fn(() => ({
    logger: {},
    finish: vi.fn(),
    finishResponse: vi.fn(async (_response: Response) => new Response("ok")),
    skipped: true,
  })),
  extractSafeHeaders: vi.fn(() => ({})),
}));

vi.mock("@watchdog/log", () => ({
  createLogger: vi.fn(() => ({
    set: vi.fn(),
    setLevel: vi.fn(),
    emit: vi.fn(),
    error: vi.fn(),
  })),
  runWithRequestLogger: vi.fn(
    async (_logger: unknown, fn: () => Promise<unknown>) => fn()
  ),
}));

vi.mock("@watchdog/env/server", () => ({
  env: {
    NODE_ENV: "production",
    S3_ENDPOINT: "https://files.example.test",
    BETTER_AUTH_URL: "https://watchdog.example.test",
  },
}));

import "@/start";

type RequestHandler = (args: {
  next: (options?: { context?: Record<string, unknown> }) => Promise<unknown>;
  request: Request;
  pathname: string;
}) => Promise<{ response: Response }>;

describe("startInstance", () => {
  it("wires security headers, evlog, csrf, and auth middleware", () => {
    expect(startConfigRef.current?.requestMiddleware).toHaveLength(3);
    expect(startConfigRef.current?.functionMiddleware).toHaveLength(2);
    expect(startConfigRef.current?.functionMiddleware?.[1]).toBe(
      "require-auth"
    );
    expect(startConfigRef.current?.requestMiddleware?.[0]).toBeDefined();
    expect(startConfigRef.current?.requestMiddleware?.[1]).toBeDefined();
    expect(startConfigRef.current?.requestMiddleware?.[2]).toBe(
      "csrf-middleware"
    );
    expect(startConfigRef.current?.functionMiddleware?.[0]).toBeDefined();
  });

  describe("security headers middleware", () => {
    const securityHeaders = startConfigRef.current
      ?.requestMiddleware?.[0] as RequestHandler;

    async function run(response: Response) {
      let nonceSeenByNext: unknown;
      const result = await securityHeaders({
        request: new Request("https://watchdog.example.test/"),
        pathname: "/",
        next: async (options) => {
          nonceSeenByNext = options?.context?.cspNonce;
          return { response };
        },
      });
      return { result, nonceSeenByNext };
    }

    it("hands the request nonce to the router context and names it in the policy", async () => {
      const { result, nonceSeenByNext } = await run(new Response("ok"));

      expect(typeof nonceSeenByNext).toBe("string");
      expect(result.response.headers.get("Content-Security-Policy")).toContain(
        `'nonce-${String(nonceSeenByNext)}'`
      );
    });

    it("uses a different nonce for every request", async () => {
      const first = await run(new Response("a"));
      const second = await run(new Response("b"));

      expect(first.nonceSeenByNext).not.toBe(second.nonceSeenByNext);
    });

    it("puts the headers on error responses too", async () => {
      const { result } = await run(new Response("denied", { status: 403 }));

      expect(result.response.status).toBe(403);
      expect(result.response.headers.get("X-Content-Type-Options")).toBe(
        "nosniff"
      );
      expect(result.response.headers.get("Strict-Transport-Security")).toBe(
        "max-age=31536000"
      );
    });
  });
});
