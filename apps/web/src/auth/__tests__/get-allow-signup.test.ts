import { describe, expect, it, vi } from "vitest";

const createIsomorphicFn = vi.hoisted(() =>
  vi.fn(() => ({
    server: (handler: () => Promise<boolean>) => ({
      client: (_clientHandler: () => Promise<boolean>) => async () => handler(),
    }),
  }))
);

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn,
}));

vi.mock("@watchdog/env/server", () => ({
  env: { BETTER_AUTH_ALLOW_SIGNUP: true },
}));

import { getAllowSignup } from "@/auth/get-allow-signup";

describe("getAllowSignup", () => {
  it("reads BETTER_AUTH_ALLOW_SIGNUP on the server path", async () => {
    await expect(getAllowSignup()).resolves.toBe(true);
  });
});
