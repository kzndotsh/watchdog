import { beforeEach, describe, expect, it, vi } from "vitest";

const createAuth = vi.hoisted(() =>
  vi.fn((options: unknown) => ({ api: {}, $Infer: {}, options }))
);

vi.mock("@watchdog/auth/server", () => ({
  createAuth,
  resolveActorOrganizationId: vi.fn(),
}));
const sharedDb = vi.hoisted(() => vi.fn(() => ({ marker: "shared-pool" })));

vi.mock("@watchdog/core/infra", () => ({ sharedDb }));
vi.mock("better-auth/tanstack-start", () => ({
  tanstackStartCookies: vi.fn(() => ({ id: "tanstack-start-cookies" })),
}));

// This file tests the real module; the shared setup file replaces it for every other test.
vi.unmock("@/auth/server");

describe("auth server", () => {
  // The module builds `auth` on import: re-evaluate it so each test (and repeat) sees its own call.
  beforeEach(() => {
    vi.resetModules();
  });

  it("hands TanStack Start's cookie plugin to createAuth as the trailing plugin", async () => {
    const { auth } = await import("@/auth/server");

    expect(auth).toBeDefined();
    expect(createAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        trailingPlugins: [{ id: "tanstack-start-cookies" }],
      })
    );
  });

  it("builds Better Auth over the shared pool the API runtime owns", async () => {
    const { auth, authDb } = await import("@/auth/server");

    expect(auth).toBeDefined();
    expect(authDb).toEqual({ marker: "shared-pool" });
    expect(createAuth).toHaveBeenCalledWith(
      expect.objectContaining({ db: authDb })
    );
  });

  it("deletes an organization's Cases before the organization goes", async () => {
    const deleteOrganizationCasesEffect = vi.fn((...args: unknown[]) => args);
    const runDomain = vi.fn(async () => 2);
    vi.doMock("@watchdog/core/cases", () => ({
      deleteOrganizationCasesEffect,
    }));
    vi.doMock("@watchdog/core/infra", () => ({ runDomain, sharedDb }));
    await import("@/auth/server");

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
