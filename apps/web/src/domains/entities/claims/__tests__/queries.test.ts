import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const listClaimsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsPageFn,
}));

import { claimListView } from "@/domains/entities/claims/queries";
import { claimList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("claims queries", () => {
  it("sends one page of the view with its fixed Entity and the Case", async () => {
    const caseId = testCaseId(1);
    listClaimsPageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    const options = claimListView.infinite(
      { caseId },
      claimList.queryOf(
        { q: "domain", sort: "created.desc" },
        { entityId: testId(2) }
      )
    );
    await new QueryClient().infiniteQuery(options);
    expect(listClaimsPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "domain",
        sort: "created.desc",
      }),
    });
    expect(listClaimsPageFn.mock.lastCall?.[0]).not.toHaveProperty(
      "data.cursor"
    );
  });
});
