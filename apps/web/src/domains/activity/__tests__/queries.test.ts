import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/activity/activity.functions", () => ({
  listRecentActivityFn: vi.fn(async () => ({
    items: [],
    nextCursor: null,
    total: { count: 0, isCapped: false },
  })),
}));

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
});
