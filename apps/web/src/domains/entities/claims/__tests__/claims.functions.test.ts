import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(
  () => [] as ((input: unknown) => Promise<unknown>)[]
);
const claimsApi = vi.hoisted(() => ({ list: vi.fn() }));

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
  orpcFromContext: vi.fn(() => ({ claims: claimsApi })),
}));

import { listClaimsPageFn } from "@/domains/entities/claims/claims.functions";

describe("listClaimsPageFn", () => {
  it("passes one page of the Claim list through whole", async () => {
    const page = {
      items: [{ id: "claim-1" }],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    };
    claimsApi.list.mockResolvedValue(page);
    expect(listClaimsPageFn).toBe("fn-1");
    const data = {
      caseId: "550e8400-e29b-41d4-a716-446655440000",
      entityId: "660e8400-e29b-41d4-a716-446655440001",
      retracted: true,
      q: "domain",
    };
    const result = await handlers[0]?.({ data, context: {} });
    expect(result).toEqual(page);
    expect(claimsApi.list).toHaveBeenCalledWith(data);
  });
});
