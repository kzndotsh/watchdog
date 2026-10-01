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
    expect(createAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        trailingPlugins: [{ id: "tanstack-start-cookies" }],
      })
    );
  });

  it("deletes an organization's Cases before the organization goes", async () => {
    const deleteOrganizationCasesEffect = vi.fn((...args: unknown[]) => args);
    const runDomain = vi.fn(async () => 2);
    vi.doMock("@watchdog/core", () => ({
      deleteOrganizationCasesEffect,
      runDomain,
    }));

    const options = createAuth.mock.calls[0]?.[0] as {
      beforeDeleteOrganization: (input: {
        organizationId: string;
        actorId: string;
      }) => Promise<void>;
    };
    await options.beforeDeleteOrganization({
      organizationId: "org-1",
      actorId: "user-1",
    });

    expect(deleteOrganizationCasesEffect).toHaveBeenCalledWith("org-1", {
      actorId: "user-1",
    });
    expect(runDomain).toHaveBeenCalledOnce();
  });
});
