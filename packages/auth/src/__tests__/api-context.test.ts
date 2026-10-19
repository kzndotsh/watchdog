import { describe, expect, it, vi } from "vitest";

import { asOrganizationId } from "@watchdog/schemas/shared";
import { testHttpOrigin } from "@watchdog/test-kit";

const resolveActorOrganizationId = vi.hoisted(() => vi.fn(async () => "org-1"));
const isActorBanned = vi.hoisted(() => vi.fn(async () => false));

vi.mock("../actor", () => ({ resolveActorOrganizationId, isActorBanned }));

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

type TestKey = {
  id: string;
  name: string;
  referenceId: string;
  metadata: unknown;
};

/** A valid API key presented as a bearer token or `x-api-key`, with no session. */
function contextForKey(
  key: TestKey,
  header: "bearer" | "x-api-key" = "bearer"
) {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
  vi.mocked(auth.api.verifyApiKey).mockResolvedValue({
    valid: true,
    key,
  } as never);
  return createApiContext(
    auth as never,
    new Request(testHttpOrigin("127.0.0.1", "/api/v1/health"), {
      headers:
        header === "bearer"
          ? { authorization: "Bearer wd_key" }
          : { "x-api-key": "wd_key" },
    })
  );
}

const agentKey: TestKey = {
  id: "key-1",
  name: "agent",
  referenceId: "user-1",
  metadata: null,
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

    expect(context.credential).toEqual({ kind: "session" });
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
    resolveActorOrganizationId.mockResolvedValueOnce("org-2");

    const context = await contextForKey({
      ...agentKey,
      metadata: { organizationId: "org-2" },
    });

    expect(resolveActorOrganizationId).toHaveBeenCalledWith("user-1", "org-2");
    expect(context.credential).toEqual({ kind: "apiKey", keyId: "key-1" });
    expect(context.actor?.organizationId).toBe("org-2");
  });

  it("rejects a scoped key whose owner left that organization", async () => {
    resolveActorOrganizationId.mockResolvedValueOnce(null as never);

    const context = await contextForKey(
      {
        ...agentKey,
        metadata: JSON.stringify({ organizationId: "org-2" }),
      },
      "x-api-key"
    );

    expect(context.actor).toBeNull();
  });

  it("keeps legacy unscoped keys on the owner's oldest organization", async () => {
    resolveActorOrganizationId.mockClear();

    const context = await contextForKey({ ...agentKey, name: "old" });

    expect(resolveActorOrganizationId).toHaveBeenCalledWith("user-1", null);
    expect(context.actor?.organizationId).toBe("org-1");
  });

  describe("a key whose owner is banned", () => {
    it("is refused: no actor, no credential", async () => {
      isActorBanned.mockResolvedValueOnce(true);

      const context = await contextForKey(agentKey);

      expect(isActorBanned).toHaveBeenCalledWith("user-1");
      expect(context.actor).toBeNull();
      expect(context.credential).toBeUndefined();
    });

    it("is let through once the ban no longer holds (an expired ban)", async () => {
      isActorBanned.mockResolvedValueOnce(false);

      const context = await contextForKey(agentKey);

      expect(context.actor?.userId).toBe("user-1");
      expect(context.credential).toEqual({ kind: "apiKey", keyId: "key-1" });
    });
  });
});
