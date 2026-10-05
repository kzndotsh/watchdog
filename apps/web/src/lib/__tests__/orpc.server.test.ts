import { describe, expect, it, vi } from "vitest";

import { TEST_ORGANIZATION_ID, testActor } from "@watchdog/schemas/testing";

const { mockClient, createRouterClient, actorFromSession, peekRequestLogger } =
  vi.hoisted(() => {
    const mockClient = { cases: { list: vi.fn() } };
    return {
      mockClient,
      createRouterClient: vi.fn(() => mockClient),
      actorFromSession: vi.fn(
        (
          session: {
            user: { id: string; email?: string | null; name?: string | null };
          },
          organizationId: string | null
        ) => ({
          userId: session.user.id,
          email: session.user.email ?? null,
          name: session.user.name ?? null,
          organizationId,
        })
      ),
      peekRequestLogger: vi.fn(() => ({})),
    };
  });

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@orpc/server", () => ({ createRouterClient }));
vi.mock("@watchdog/api", () => ({ router: {} }));
vi.mock("@watchdog/log", () => ({ peekRequestLogger }));
vi.mock("@watchdog/auth/server", () => ({ actorFromSession }));

import { orpcForActor, orpcFromContext } from "@/lib/orpc.server";

describe("orpc.server", () => {
  it("creates an in-process router client for an actor", () => {
    createRouterClient.mockClear();
    const actor = testActor({ email: "a@b.c", name: "Alice" });

    const client = orpcForActor(actor);

    expect(createRouterClient).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        context: expect.objectContaining({
          actor,
          authMethod: "session",
        }),
      })
    );
    expect(client).toBe(mockClient);
  });

  it("derives the actor from session context", () => {
    actorFromSession.mockClear();
    const session = { user: { id: "u1", email: "a@b.c", name: "Alice" } };

    orpcFromContext({ session, organizationId: TEST_ORGANIZATION_ID });

    expect(actorFromSession).toHaveBeenCalledWith(
      session,
      TEST_ORGANIZATION_ID
    );
  });
});
