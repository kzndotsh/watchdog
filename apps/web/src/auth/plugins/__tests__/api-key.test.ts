import { beforeEach, describe, expect, it, vi } from "vitest";

const coreFactory = vi.hoisted(() =>
  vi.fn(() => ({
    securityCards: ["security-card"],
    organization: { enabled: true },
  }))
);

vi.mock("@better-auth-ui/core/plugins/api-key", () => ({
  apiKeyPlugin: Object.assign(() => coreFactory(), { id: "apiKey" }),
}));

vi.mock("@better-auth-ui/core", () => ({
  createAuthPlugin: (_id: string, factory: (options?: unknown) => unknown) =>
    factory({}),
}));

describe("apiKeyPlugin", () => {
  // The plugin is built on import: re-evaluate it so each test (and repeat) sees its own call.
  beforeEach(() => {
    vi.resetModules();
  });

  it("clears security cards and keeps organization API key cards empty", async () => {
    const { apiKeyPlugin } = await import("@/auth/plugins/api-key");

    expect(coreFactory).toHaveBeenCalled();
    expect(apiKeyPlugin).toMatchObject({
      securityCards: [],
      organizationCards: [],
    });
    expect(coreFactory).toHaveBeenCalledTimes(1);
  });
});
