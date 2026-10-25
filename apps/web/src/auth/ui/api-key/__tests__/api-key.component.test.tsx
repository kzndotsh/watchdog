import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/client", () => ({ authClient: {} }));

vi.mock("@better-auth-ui/react", () => ({
  useAuth: () => ({ localization: { settings: { delete: "Delete" } } }),
  useAuthPlugin: () => ({
    localization: { apiKey: "API key", deleteApiKey: "Delete API key" },
  }),
}));

import type { ListedApiKey } from "@better-auth-ui/core/plugins/api-key";

import { ApiKey } from "@/auth/ui/api-key/api-key";

function renderKey(permissions: ListedApiKey["permissions"]) {
  const apiKey: ListedApiKey = {
    id: "k1",
    configId: "default",
    name: "ci",
    start: "wd_ab",
    prefix: "wd_",
    referenceId: "u1",
    refillInterval: null,
    refillAmount: null,
    lastRefillAt: null,
    enabled: true,
    rateLimitEnabled: false,
    rateLimitTimeWindow: null,
    rateLimitMax: null,
    requestCount: 0,
    remaining: null,
    lastRequest: null,
    expiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    metadata: null,
    permissions,
  };
  return render(<ApiKey apiKey={apiKey} hideDelete />);
}

describe("ApiKey scopes", () => {
  it("lists the scopes parsed from the stored permissions", () => {
    renderKey({ cases: ["read"], evidence: ["write"] });

    expect(screen.getByText("Read cases")).toBeInTheDocument();
    expect(screen.getByText("Collect evidence")).toBeInTheDocument();
    expect(screen.queryByText("Write the Graph")).not.toBeInTheDocument();
  });

  it("shows a write scope together with the read it implies", () => {
    renderKey({ graph: ["write"] });

    expect(screen.getByText("Write the Graph")).toBeInTheDocument();
    expect(screen.getByText("Read cases")).toBeInTheDocument();
  });

  it.each([null, {}])(
    "labels a key with no permissions (%j) as refused, not as read only",
    (permissions) => {
      renderKey(permissions);

      expect(
        screen.getByText("Unreadable scopes (key refused)")
      ).toBeInTheDocument();
      expect(screen.queryByText("Read cases")).not.toBeInTheDocument();
    }
  );

  it("says so when the stored scopes cannot be read", () => {
    renderKey({ admin: ["write"] });

    expect(
      screen.getByText("Unreadable scopes (key refused)")
    ).toBeInTheDocument();
  });
});
