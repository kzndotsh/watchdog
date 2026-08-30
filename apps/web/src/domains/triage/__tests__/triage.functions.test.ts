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
    proposals: {
      listForCase: vi.fn().mockResolvedValue([{ id: "proposal-1" }]),
    },
  })),
}));

import { listProposalsFn } from "@/domains/triage/triage.functions";

describe("listProposalsFn", () => {
  it("delegates to the proposals oRPC client", async () => {
    expect(listProposalsFn).toBe("fn-1");
    const rows = await handlers[0]?.({
      data: { caseId: "550e8400-e29b-41d4-a716-446655440000" },
      context: {},
    });
    expect(rows).toEqual([{ id: "proposal-1" }]);
  });
});
