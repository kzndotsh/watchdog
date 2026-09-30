import { describe, expect, it, vi } from "vitest";

const createAuth = vi.hoisted(() =>
  vi.fn((options: unknown) => ({ api: {}, $Infer: {}, options }))
);

vi.mock("@watchdog/auth/server", () => ({
  createAuth,
  resolveActorOrganizationId: vi.fn(),
}));
vi.mock("better-auth/tanstack-start", () => ({
  tanstackStartCookies: vi.fn(() => ({ id: "tanstack-start-cookies" })),
}));

import { auth } from "@/auth/server";

describe("auth server", () => {
  it("hands TanStack Start's cookie plugin to createAuth as the trailing plugin", () => {
    expect(auth).toBeDefined();
    expect(createAuth).toHaveBeenCalledWith({
      trailingPlugins: [{ id: "tanstack-start-cookies" }],
    });
  });
});
