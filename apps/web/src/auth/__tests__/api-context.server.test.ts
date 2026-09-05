import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

const resolveActorOrganizationId = vi.hoisted(() => vi.fn(async () => "org-1"));

vi.mock("@/auth/server", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      verifyApiKey: vi.fn(),
    },
  },
  resolveActorOrganizationId,
}));

vi.mock("@watchdog/log", () => ({
  identifyUser: vi.fn(),
  peekRequestLogger: vi.fn(() => null),
}));

import { actorFromSession, createApiContext } from "@/auth/api-context.server";
import { auth } from "@/auth/server";

describe("api-context.server", () => {
  it("maps a session user to an ApiActor", () => {
    expect(
      actorFromSession(
        {
          user: { id: "user-1", email: "a@example.com", name: "Analyst" },
        },
        "org-1"
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
});
