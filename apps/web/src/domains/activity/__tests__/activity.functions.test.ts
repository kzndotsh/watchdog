import { describe, expect, it, vi } from "vitest";

const handlerRef = vi.hoisted(() => ({
  current: undefined as ((input: unknown) => Promise<unknown>) | undefined,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (handler: (input: unknown) => Promise<unknown>) => {
        handlerRef.current = handler;
        return "listRecentActivityFn";
      },
    }),
  }),
}));

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: vi.fn(() => ({
    activity: {
      listRecent: vi
        .fn()
        .mockResolvedValue({ items: [{ id: "activity-1" }], nextCursor: null }),
    },
  })),
}));

import { listRecentActivityFn } from "@/domains/activity/activity.functions";

describe("listRecentActivityFn", () => {
  it("delegates to the activity oRPC client", async () => {
    expect(listRecentActivityFn).toBe("listRecentActivityFn");
    const rows = await handlerRef.current?.({
      data: { caseId: "case-1", limit: 5 },
      context: {},
    });
    expect(rows).toEqual([{ id: "activity-1" }]);
  });
});
