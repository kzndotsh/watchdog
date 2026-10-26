import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

const listEventsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  listEventsPageFn,
}));

import { eventsKeys, eventListView } from "@/domains/entities/events/queries";
import { eventList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("events queries", () => {
  it("keys every list view under the Case prefix that invalidation names", () => {
    const caseId = testCaseId(1);
    expect(eventsKeys.prefix(caseId)).toEqual(["events", caseId]);
    const key = eventListView.key(
      { caseId },
      eventList.queryOf({}, { entityId: testId(2) })
    );
    expect(key.slice(0, 2)).toEqual(eventsKeys.prefix(caseId));
    expect(key[2]).toBe("list");
  });

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
    expect(options).toMatchObject({
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
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
