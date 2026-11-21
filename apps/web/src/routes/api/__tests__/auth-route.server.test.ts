import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin } from "@watchdog/domain/test-kit";

const authHandlerMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(new Response("auth-ok"))
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/auth/server", () => ({
  auth: { handler: authHandlerMock },
}));

import { Route } from "@/routes/api/auth/$";

describe("api auth route", () => {
  it("delegates GET and POST requests to Better Auth", async () => {
    const request = new Request(
      testHttpOrigin("localhost", "/api/auth/session")
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

    await handlers.GET({ request });
    await handlers.POST({ request });

    expect(authHandlerMock).toHaveBeenCalledTimes(2);
    expect(authHandlerMock).toHaveBeenCalledWith(request);
  });
});
