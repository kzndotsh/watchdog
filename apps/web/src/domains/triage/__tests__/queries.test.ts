import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_REALTIME, STALE_REALTIME } from "@/shared/lib/query-stale";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listProposalsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/triage/triage.functions", () => ({
  listProposalsFn: vi.fn(),
  listProposalsPageFn,
}));

import {
  allProposalsQuery,
  proposalsByStatusQuery,
  proposalsKeys,
} from "@/domains/triage/queries";

describe("triage queries", () => {
  it("builds proposal status keys", () => {
    expect(proposalsKeys.all("case-1")).toEqual(["proposals", "case-1"]);
    expect(proposalsKeys.status("case-1", "pending")).toEqual([
      "proposals",
      "case-1",
      "pending",
    ]);
  });

  it("uses realtime tiers for proposal lists", () => {
    expect(proposalsByStatusQuery("case-1", "pending")).toMatchObject({
      queryKey: proposalsKeys.status("case-1", "pending"),
      staleTime: STALE_REALTIME,
      gcTime: GC_REALTIME,
    });
    expect(allProposalsQuery("case-1")).toMatchObject({
      queryKey: proposalsKeys.queue("case-1"),
      staleTime: STALE_REALTIME,
      gcTime: GC_REALTIME,
    });
  });

  it("keeps the queue under the key prefix the invalidations name", () => {
    expect(proposalsKeys.queue("case-1").slice(0, 2)).toEqual(
      proposalsKeys.all("case-1")
    );
  });

  it("reads the queue a page at a time and flattens the loaded pages", async () => {
    const proposal = (n: number) => ({ id: testId(n) });
    listProposalsPageFn
      .mockResolvedValueOnce({ items: [proposal(1)], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: [proposal(2)], nextCursor: null });
    const observer = new InfiniteQueryObserver(
      new QueryClient(),
      allProposalsQuery(testCaseId(10))
    );

    const first = await observer.fetchNextPage();
    expect(first.data).toEqual([proposal(1)]);
    expect(first.hasNextPage).toBe(true);
    expect(listProposalsPageFn).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ caseId: testCaseId(10) }),
    });

    const second = await observer.fetchNextPage();
    expect(second.data).toEqual([proposal(1), proposal(2)]);
    expect(second.hasNextPage).toBe(false);
    expect(listProposalsPageFn).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        caseId: testCaseId(10),
        cursor: "cursor-1",
      }),
    });
  });
});
