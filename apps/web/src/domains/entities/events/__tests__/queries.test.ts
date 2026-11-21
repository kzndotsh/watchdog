import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { eventListView, eventsKeys } from "@/domains/entities/events/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { eventList } from "@watchdog/domain/schemas/graph";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

const listEvents = procedureDouble("events.list");

describe("events queries", () => {
  it("sends one page of the view with its fixed Entity and the Case to events.list", async () => {
    const caseId = testCaseId(1);
    listEvents.mockResolvedValue({
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
    expect(listEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "moved",
        sort: "when.desc",
      })
    );
    expect(listEvents.mock.lastCall?.[0]).not.toHaveProperty("cursor");
  });

  it("keys a view under the Case's events key, not another Case's", () => {
    const view = (caseId: string) =>
      eventListView.key({ caseId }, eventList.queryOf({}, {}));
    const client = new QueryClient();
    client.setQueryData(view(testCaseId(1)), { pages: [], pageParams: [] });
    client.setQueryData(view(testCaseId(2)), { pages: [], pageParams: [] });
    const matched = client
      .getQueryCache()
      .findAll({ queryKey: eventsKeys.all(testCaseId(1)) })
      .map((query) => query.queryKey);
    expect(matched).toEqual([view(testCaseId(1))]);
  });
});
