import { describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const resolveActorOrganizationId = vi.hoisted(() => vi.fn(async () => "org-1"));

vi.mock("@/auth/session.server", () => ({
  requireSession,
}));

vi.mock("@/auth/server", () => ({
  resolveActorOrganizationId,
}));

const serverHandlerRef = vi.hoisted(() => ({
  current: undefined as
    | ((ctx: {
        next: (input: {
          context: { session: unknown; organizationId: string | null };
        }) => Promise<Response>;
      }) => Promise<Response>)
    | undefined,
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (
      handler: (ctx: {
        next: (input: {
          context: { session: unknown; organizationId: string | null };
        }) => Promise<Response>;
      }) => Promise<Response>
    ) => {
      serverHandlerRef.current = handler;
      return { type: "function" as const };
    },
  }),
}));

import "@/auth/middleware";

describe("requireAuth middleware", () => {
  it("injects the session into middleware context", async () => {
    const session = {
      user: { id: "user-1" },
      session: { activeOrganizationId: "org-1" },
    };
    requireSession.mockResolvedValue(session);
    const next = vi.fn(async ({ context }) => {
      expect(context.session).toBe(session);
      expect(context.organizationId).toBe("org-1");
      return new Response("ok");
    });

    expect(serverHandlerRef.current).toBeTypeOf("function");
    const response = await serverHandlerRef.current!({ next });
    expect(response.status).toBe(200);
    expect(requireSession).toHaveBeenCalledTimes(1);
  });
});
