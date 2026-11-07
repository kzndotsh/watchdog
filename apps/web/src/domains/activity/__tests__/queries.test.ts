import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const { listRecentActivityFn } = vi.hoisted(() => ({
  listRecentActivityFn: vi.fn(),
}));

vi.mock("@/domains/activity/activity.functions", () => ({
  listRecentActivityFn,
}));

import { QueryClient } from "@tanstack/react-query";

import { activityKeys, activityListView } from "@/domains/activity/queries";
import { activityList } from "@watchdog/schemas/feed";

describe("activity list view", () => {
  it("keys every view under the activity root, so one invalidation refreshes them all", () => {
    const all = activityListView.key({}, activityList.queryOf({}));
    const oneCase = activityListView.key(
      {},
      activityList.queryOf({ caseId: testId(10) })
    );
    expect(all.slice(0, activityKeys.all.length)).toEqual(activityKeys.all);
    expect(oneCase.slice(0, activityKeys.all.length)).toEqual(activityKeys.all);
    expect(oneCase).not.toEqual(all);
  });

  it("asks the server function for the Case and the cursor, and pages past the list ceiling", async () => {
    const caseId = testId(10);
    const page = (nextCursor: string | null) => ({
      items: [],
      nextCursor,
      total: null,
    });
    listRecentActivityFn.mockReset();
    listRecentActivityFn.mockImplementation(
      async ({ data }: { data: { cursor?: string } }) =>
        page(data.cursor === undefined ? "c1" : null)
    );
    const client = new QueryClient();
    const options = activityListView.infinite(
      {},
      activityList.queryOf({ caseId })
    );
    await client.infiniteQuery({ ...options, pages: 2 });
    expect(listRecentActivityFn.mock.calls).toEqual([
      [{ data: { caseId } }],
      [{ data: { caseId, cursor: "c1" } }],
    ]);
    expect(
      options.getNextPageParam(
        page("c2"),
        Array.from({ length: 50 }, () => page("c")),
        undefined,
        []
      )
    ).toBe("c2");
  });
});
