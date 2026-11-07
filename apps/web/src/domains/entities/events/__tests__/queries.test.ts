import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const listEventsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  listEventsPageFn,
}));

import { eventListView } from "@/domains/entities/events/queries";
import { eventList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("events queries", () => {
  it("sends one page of the view with its fixed Entity and the Case", async () => {
    const caseId = testCaseId(1);
    listEventsPageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    const options = eventListView.infinite(
      { caseId },
      eventList.queryOf(
        { q: "moved", sort: "when.desc" },
        { entityId: testId(2) }
      )
    );
    await new QueryClient().infiniteQuery(options);
    expect(listEventsPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "moved",
        sort: "when.desc",
      }),
    });
    expect(listEventsPageFn.mock.lastCall?.[0]).not.toHaveProperty(
      "data.cursor"
    );
  });
});
