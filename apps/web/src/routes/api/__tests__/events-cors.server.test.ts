import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@watchdog/auth/server", () => ({
  configuredTrustedOrigins: () => ["https://app.example.test"],
  createApiContext: vi.fn().mockResolvedValue({ actor: null }),
}));

vi.mock("@watchdog/api", () => ({ runApp: vi.fn() }));
vi.mock("@watchdog/core/activity", () => ({
  ActivityTailer: {},
  replayActivityEffect: vi.fn(),
}));
vi.mock("@watchdog/core/graph", () => ({ assertCaseInOrgEffect: vi.fn() }));
vi.mock("@watchdog/core/cases", () => ({ listVisibleCaseIdsEffect: vi.fn() }));
vi.mock("@watchdog/log", () => ({ createLogger: vi.fn() }));

import { Route } from "@/routes/api/events";

const LISTED = "https://app.example.test";
const UNLISTED = "https://other.example.test";

type Handlers = Record<
  string,
  (ctx: { request: Request }) => Promise<Response>
>;
const handlers = (Route.options as { server: { handlers: Handlers } }).server
  .handlers;

function eventsRequest(origin: string, method: string): Request {
  return new Request(testHttpOrigin("localhost", "/api/events"), {
    method,
    headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
  });
}

describe("api events route cross-origin access", () => {
  it("sends CORS headers with credentials to a trusted origin", async () => {
    const response = await handlers.GET({
      request: eventsRequest(LISTED, "GET"),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LISTED);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
  });

  it("sends no CORS headers to an origin that is not trusted", async () => {
    const response = await handlers.GET({
      request: eventsRequest(UNLISTED, "GET"),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("answers a trusted origin's preflight with the allow headers", async () => {
    const response = await handlers.OPTIONS({
      request: eventsRequest(LISTED, "OPTIONS"),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LISTED);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET"
    );
  });

  it("answers an untrusted origin's preflight without CORS headers", async () => {
    const response = await handlers.OPTIONS({
      request: eventsRequest(UNLISTED, "OPTIONS"),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull();
  });
});
