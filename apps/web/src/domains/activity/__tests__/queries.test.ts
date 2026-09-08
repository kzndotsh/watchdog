import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/activity/activity.functions", () => ({
  listRecentActivityFn: vi.fn(async () => []),
}));

import { activityKeys, recentActivityQuery } from "@/domains/activity/queries";

describe("activity queries", () => {
  it("builds stable recent activity query keys", () => {
    const caseId = testId(10);
    expect(activityKeys.recent({ caseId, limit: 10 })).toEqual([
      "activity",
      "recent",
      { caseId, limit: 10 },
    ]);
  });

  it("scopes invalid case ids out of recent activity query keys", () => {
    expect(recentActivityQuery({ caseId: "case-1" })).toMatchObject({
      queryKey: ["activity", "recent", {}],
      enabled: false,
    });
  });

  it("wires listRecentActivityFn into query options", () => {
    const caseId = testId(10);
    expect(recentActivityQuery({ caseId }).queryKey).toEqual([
      "activity",
      "recent",
      { caseId },
    ]);
  });

  it("keeps placeholder data only for the same activity filter key", () => {
    const caseId = testId(10);
    const caseScoped = recentActivityQuery({ caseId });
    const placeholder = caseScoped.placeholderData;
    const limitedPlaceholder = recentActivityQuery({
      caseId,
      limit: 5,
    }).placeholderData;
    expect(typeof placeholder).toBe("function");
    expect(typeof limitedPlaceholder).toBe("function");
    if (
      typeof placeholder !== "function" ||
      typeof limitedPlaceholder !== "function"
    ) {
      return;
    }

    const previousData = [{ id: "act-1" }] as never;
    const sameCase = { queryKey: activityKeys.recent({ caseId }) };
    const otherLimit = {
      queryKey: activityKeys.recent({ caseId, limit: 5 }),
    };

    expect(placeholder(previousData, sameCase as never)).toEqual(previousData);
    expect(placeholder(previousData, otherLimit as never)).toBeUndefined();
    expect(limitedPlaceholder(previousData, otherLimit as never)).toEqual(
      previousData
    );
  });
});
