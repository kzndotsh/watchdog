import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

const listClaimsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsPageFn,
}));

import { claimsKeys, claimListView } from "@/domains/entities/claims/queries";
import { claimList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("claims queries", () => {
  it("keys every list view under the Case prefix that invalidation names", () => {
    const caseId = testCaseId(1);
    expect(claimsKeys.prefix(caseId)).toEqual(["claims", caseId]);
    const key = claimListView.key(
      { caseId },
      claimList.queryOf({}, { entityId: testId(2) })
    );
    expect(key.slice(0, 2)).toEqual(claimsKeys.prefix(caseId));
    expect(key[2]).toBe("list");
  });

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
        { q: "domain", sort: "added.desc" },
        { entityId: testId(2) }
      )
    );
    expect(options).toMatchObject({
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    await new QueryClient().infiniteQuery(options);
    expect(listClaimsPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "domain",
        sort: "added.desc",
      }),
    });
    expect(listClaimsPageFn.mock.lastCall?.[0]).not.toHaveProperty(
      "data.cursor"
    );
  });
});
