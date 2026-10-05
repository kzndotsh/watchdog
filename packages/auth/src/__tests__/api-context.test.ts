import { describe, expect, it, vi } from "vitest";

import { asOrganizationId } from "@watchdog/schemas/shared";
import { testHttpOrigin } from "@watchdog/test-kit";

const resolveActorOrganizationId = vi.hoisted(() => vi.fn(async () => "org-1"));

vi.mock("../actor", () => ({ resolveActorOrganizationId }));

vi.mock("@watchdog/log", () => ({
  identifyUser: vi.fn(),
  peekRequestLogger: vi.fn(() => null),
}));

import { actorFromSession, createApiContext } from "../api-context";

const auth = {
  api: {
    getSession: vi.fn(),
    verifyApiKey: vi.fn(),
  },
};

describe("api-context", () => {
  it("maps a session user to an ApiActor", () => {
    expect(
      actorFromSession(
        {
          user: { id: "user-1", email: "a@example.com", name: "Analyst" },
        },
        asOrganizationId("org-1")
      )
    ).toEqual({
      userId: "user-1",
      email: "a@example.com",
      name: "Analyst",
      organizationId: "org-1",
    });
  });

  it("returns a session-backed API context", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1", email: null, name: "Analyst" },
      session: { activeOrganizationId: "org-1" },
    } as never);

    const context = await createApiContext(
      auth as never,
      new Request(testHttpOrigin("127.0.0.1", "/api/v1/health"))
    );

    expect(context.authMethod).toBe("session");
    expect(context.actor).toEqual({
      userId: "user-1",
      email: null,
      name: "Analyst",
      organizationId: "org-1",
    });
    expect(resolveActorOrganizationId).toHaveBeenCalledWith("user-1", "org-1");
  });

  it("scopes an API key to the organization in its metadata", async () => {
    resolveActorOrganizationId.mockClear();
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    vi.mocked(auth.api.verifyApiKey).mockResolvedValue({
      valid: true,
      key: {
        id: "key-1",
        name: "agent",
        referenceId: "user-1",
        metadata: { organizationId: "org-2" },
      },
    } as never);
    resolveActorOrganizationId.mockResolvedValueOnce("org-2");

    const context = await createApiContext(
      auth as never,
      new Request(testHttpOrigin("127.0.0.1", "/api/v1/health"), {
        headers: { authorization: "Bearer wd_key" },
      })
    );

    expect(resolveActorOrganizationId).toHaveBeenCalledWith("user-1", "org-2");
    expect(context.authMethod).toBe("apiKey");
    expect(context.actor?.organizationId).toBe("org-2");
  });

  it("rejects a scoped key whose owner left that organization", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    vi.mocked(auth.api.verifyApiKey).mockResolvedValue({
      valid: true,
      key: {
        id: "key-1",
        name: "agent",
        referenceId: "user-1",
        metadata: JSON.stringify({ organizationId: "org-2" }),
      },
    } as never);
    resolveActorOrganizationId.mockResolvedValueOnce(null as never);

    const context = await createApiContext(
      auth as never,
      new Request(testHttpOrigin("127.0.0.1", "/api/v1/health"), {
        headers: { "x-api-key": "wd_key" },
      })
    );

    expect(context.actor).toBeNull();
  });

  it("keeps legacy unscoped keys on the owner's oldest organization", async () => {
    resolveActorOrganizationId.mockClear();
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    vi.mocked(auth.api.verifyApiKey).mockResolvedValue({
      valid: true,
      key: { id: "key-1", name: "old", referenceId: "user-1", metadata: null },
    } as never);

    const context = await createApiContext(
      auth as never,
      new Request(testHttpOrigin("127.0.0.1", "/api/v1/health"), {
        headers: { authorization: "Bearer wd_key" },
      })
    );

    expect(resolveActorOrganizationId).toHaveBeenCalledWith("user-1", null);
    expect(context.actor?.organizationId).toBe("org-1");
  });
});
