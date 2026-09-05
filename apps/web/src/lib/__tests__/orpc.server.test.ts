import { describe, expect, it, vi } from "vitest";

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
vi.mock("@/auth/api-context.server", () => ({ actorFromSession }));

import {
  actorFromSession as exportedActorFromSession,
  orpcForActor,
  orpcFromContext,
} from "@/lib/orpc.server";

describe("orpc.server", () => {
  it("creates an in-process router client for an actor", () => {
    createRouterClient.mockClear();
    const actor = {
      userId: "u1",
      email: "a@b.c",
      name: "Alice",
      organizationId: "org-1",
    };

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

    orpcFromContext({ session, organizationId: "org-1" });

    expect(actorFromSession).toHaveBeenCalledWith(session, "org-1");
  });

  it("re-exports actorFromSession", () => {
    expect(exportedActorFromSession).toBe(actorFromSession);
    expect(createRouterClient).toBeDefined();
  });
});
