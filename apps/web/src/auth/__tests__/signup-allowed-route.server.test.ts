import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@watchdog/env/server", () => ({
  env: { BETTER_AUTH_ALLOW_SIGNUP: false },
}));

import { Route } from "@/routes/api/signup-allowed";

describe("api signup-allowed route", () => {
  it("returns the server signup flag as JSON", async () => {
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<string, () => Promise<Response>>;
        };
      }
    ).server.handlers;

    const response = await handlers.GET();
    await expect(response.json()).resolves.toEqual({ allowSignup: false });
  });
});
