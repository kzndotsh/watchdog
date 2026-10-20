import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(
  () => [] as ((input: unknown) => Promise<unknown>)[]
);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (handler: (input: unknown) => Promise<unknown>) => {
        handlers.push(handler);
        return `fn-${handlers.length}`;
      },
    }),
  }),
}));

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: vi.fn(() => ({
    claims: {
      list: vi
        .fn()
        .mockResolvedValue({ items: [{ id: "claim-1" }], nextCursor: null }),
    },
  })),
}));

import { listClaimsFn } from "@/domains/entities/claims/claims.functions";

describe("listClaimsFn", () => {
  it("delegates to the claims oRPC client", async () => {
    expect(listClaimsFn).toBe("fn-1");
    const rows = await handlers[0]?.({
      data: {
        caseId: "550e8400-e29b-41d4-a716-446655440000",
        entityId: "660e8400-e29b-41d4-a716-446655440001",
        includeRetracted: false,
      },
      context: {},
    });
    expect(rows).toEqual([{ id: "claim-1" }]);
  });
});
