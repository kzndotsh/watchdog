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
    evidence: {
      list: vi
        .fn()
        .mockResolvedValue({ items: [{ id: "evidence-1" }], nextCursor: null }),
    },
  })),
}));

import { listEvidenceFn } from "@/domains/intake/intake.functions";

describe("listEvidenceFn", () => {
  it("delegates to the evidence oRPC client", async () => {
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
  });
});
