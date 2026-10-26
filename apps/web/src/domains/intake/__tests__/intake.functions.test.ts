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

const evidenceApi = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: vi.fn(() => ({ evidence: evidenceApi })),
}));

import { listEvidenceFn } from "@/domains/intake/intake.functions";

describe("listEvidenceFn", () => {
  it("delegates to the evidence oRPC client", async () => {
    evidenceApi.list.mockResolvedValue({
      items: [{ id: "evidence-1" }],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    });
    expect(listEvidenceFn).toBe("fn-2");
    const rows = await handlers[1]?.({
      data: {
        caseId: "550e8400-e29b-41d4-a716-446655440000",
        unprocessedOnly: false,
        unattachedOnly: false,
        hiddenOnly: false,
      },
      context: {},
    });
    expect(rows).toEqual([{ id: "evidence-1" }]);
    expect(evidenceApi.list).toHaveBeenCalledWith({
      caseId: "550e8400-e29b-41d4-a716-446655440000",
      limit: 200,
    });
  });

  it("sends the hidden view as the declared list's true-only flag", async () => {
    evidenceApi.list.mockClear();
    evidenceApi.list.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    await handlers[1]?.({
      data: {
        caseId: "550e8400-e29b-41d4-a716-446655440000",
        unprocessedOnly: false,
        unattachedOnly: false,
        hiddenOnly: true,
      },
      context: {},
    });
    expect(evidenceApi.list).toHaveBeenCalledWith({
      caseId: "550e8400-e29b-41d4-a716-446655440000",
      hidden: true,
      limit: 200,
    });
  });
});
