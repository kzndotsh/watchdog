import { describe, expect, it, vi } from "vitest";

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

import { apiKeyPlugin } from "@/auth/plugins/api-key";

describe("apiKeyPlugin", () => {
  it("clears security cards and keeps organization API key cards empty", () => {
    expect(coreFactory).toHaveBeenCalled();
    expect(apiKeyPlugin).toMatchObject({
      securityCards: [],
      organizationCards: [],
    });
    expect(coreFactory).toHaveBeenCalledTimes(1);
  });
});
