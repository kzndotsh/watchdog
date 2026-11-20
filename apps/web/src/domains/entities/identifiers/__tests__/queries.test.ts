import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const listIdentifiersPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  listIdentifiersPageFn,
}));

import {
  identifierListView,
  identifierTypeCountsQuery,
} from "@/domains/entities/identifiers/queries";
import { placeholderFor } from "@/testing/query-placeholder";
import { identifierList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("identifiers queries", () => {
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

  it("keeps an Entity's previous type counts for its next view, never for another Entity", () => {
    const caseId = testCaseId(1);
    const countsOf = (entityId: string, q?: string) =>
      identifierTypeCountsQuery(
        caseId,
        identifierList.queryOf(q === undefined ? {} : { q }, { entityId })
      );
    const previous = {
      counts: [{ type: "email" as const, count: 1 }],
      isCapped: false,
    };
    const next = countsOf(testId(2), "acme");

    expect(
      placeholderFor(next, previous, countsOf(testId(2)).queryKey)
    ).toEqual(previous);
    expect(
      placeholderFor(next, previous, countsOf(testId(3)).queryKey)
    ).toBeUndefined();
  });
});
