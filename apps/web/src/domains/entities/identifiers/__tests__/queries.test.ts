import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

const listIdentifiersPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  listIdentifiersPageFn,
}));

import {
  identifierListView,
  identifiersKeys,
} from "@/domains/entities/identifiers/queries";
import { identifierList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("identifiers queries", () => {
  it("builds the case-wide key", () => {
    expect(identifiersKeys.prefix("case-1")).toEqual(["identifiers", "case-1"]);
  });

  it("keys every list view under the Case prefix that invalidation names", () => {
    const caseId = testCaseId(1);
    const key = identifierListView.key(
      { caseId },
      identifierList.queryOf({ type: ["email"] }, { entityId: testId(2) })
    );
    expect(key.slice(0, 2)).toEqual(identifiersKeys.prefix(caseId));
    expect(key[2]).toBe("list");
  });

  it("sends one page of the view, its fixed filter and cursor with the Case", async () => {
    const caseId = testCaseId(1);
    listIdentifiersPageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    const options = identifierListView.infinite(
      { caseId },
      identifierList.queryOf(
        { q: "acme", sort: "created.desc" },
        { entityId: testId(2) }
      )
    );
    expect(options).toMatchObject({
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    const client = new QueryClient();
    await client.infiniteQuery(options);
    expect(listIdentifiersPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "acme",
        sort: "created.desc",
      }),
    });
    expect(listIdentifiersPageFn.mock.lastCall?.[0]).not.toHaveProperty(
      "data.cursor"
    );
  });
});
