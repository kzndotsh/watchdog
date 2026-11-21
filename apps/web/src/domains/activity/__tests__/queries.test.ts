import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { activityListView } from "@/domains/activity/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { activityList } from "@watchdog/schemas/feed";
import { testId } from "@watchdog/test-kit";

const listRecent = procedureDouble("activity.listRecent");

describe("activity list view", () => {
  it("keys a Case's view apart from the whole feed's", () => {
    const all = activityListView.key({}, activityList.queryOf({}));
    const oneCase = activityListView.key(
      {},
      activityList.queryOf({ caseId: testId(10) })
    );

    expect(oneCase).not.toEqual(all);
  });

  it("asks activity.listRecent for the Case and the cursor, and pages past the list ceiling", async () => {
    const caseId = testId(10);
    const page = (nextCursor: string | null) => ({
      items: [],
      nextCursor,
      total: null,
    });
    listRecent.mockImplementation(async (input) =>
      page(input.cursor === undefined ? "c1" : null)
    );
    const options = activityListView.infinite(
      {},
      activityList.queryOf({ caseId })
    );
    await new QueryClient().infiniteQuery({ ...options, pages: 2 });
    expect(listRecent.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({ caseId }),
      expect.objectContaining({ caseId, cursor: "c1" }),
    ]);
    expect(listRecent.mock.calls[0]?.[0]).not.toHaveProperty("cursor");
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
