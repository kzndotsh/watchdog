import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);

const createScopedApiKey = vi.hoisted(() => vi.fn());
vi.mock("@watchdog/auth/server", () => ({ createScopedApiKey }));

import { createApiKeyFn } from "@/auth/api-key.functions";
import { callServerFn } from "@/testing/server-fn";

const SESSION_CONTEXT = {
  session: { user: { id: "user-1" }, session: {} },
  organizationId: "org-from-server",
};

describe("createApiKeyFn", () => {
  it("creates the key as the session user in the server-resolved organization", async () => {
    createScopedApiKey.mockResolvedValue({ id: "k1", name: "ci", key: "wd_x" });

    const result = await callServerFn(
      createApiKeyFn,
      { name: "ci", scopes: ["proposals:write"], expiresIn: 86_400 },
      SESSION_CONTEXT
    );

    expect(result).toEqual({ id: "k1", name: "ci", key: "wd_x" });
    expect(createScopedApiKey).toHaveBeenLastCalledWith(expect.anything(), {
      userId: "user-1",
      organizationId: "org-from-server",
      name: "ci",
      scopes: ["proposals:write"],
      expiresIn: 86_400,
    });
  });

  it("takes no organization or user from the client", async () => {
    createScopedApiKey.mockResolvedValue({ id: "k2", name: "ci", key: "wd_y" });

    await callServerFn(
      createApiKeyFn,
      {
        scopes: ["cases:read"],
        organizationId: "org-evil",
        userId: "victim",
        metadata: { organizationId: "org-evil" },
      },
      SESSION_CONTEXT
    );

    expect(createScopedApiKey).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        organizationId: "org-from-server",
        scopes: ["cases:read"],
      })
    );
  });

  it.each([
    ["a scope outside the allowed set", { scopes: ["admin:write"] }],
    ["no scopes", { scopes: [] }],
  ])("refuses %s", async (_label, input) => {
    createScopedApiKey.mockClear();

    await expect(
      callServerFn(createApiKeyFn, input, SESSION_CONTEXT)
    ).rejects.toThrow();

    expect(createScopedApiKey).not.toHaveBeenCalled();
  });
});
