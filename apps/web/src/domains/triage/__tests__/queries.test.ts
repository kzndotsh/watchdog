import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_REALTIME, STALE_REALTIME } from "@/shared/lib/query-stale";
import { proposalList } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listProposalsPageFn = vi.hoisted(() => vi.fn());
const getProposalFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/triage/triage.functions", () => ({
  listProposalsPageFn,
  getProposalFn,
}));

import {
  pendingProposalsQuery,
  proposalByIdQuery,
  proposalListView,
  proposalsKeys,
} from "@/domains/triage/queries";

const CASE_ID = testCaseId(10);

describe("triage queries", () => {
  it("keeps every Proposal read under the key prefix the invalidations name", () => {
    const all = proposalsKeys.all(CASE_ID);
    const view = proposalListView.key(
      { caseId: CASE_ID },
      proposalList.queryOf({ status: ["pending"] })
    );
    expect(view.slice(0, 2)).toEqual(all);
    expect(proposalsKeys.byId(CASE_ID, testId(1)).slice(0, 2)).toEqual(all);
    expect(pendingProposalsQuery(CASE_ID).queryKey.slice(0, 2)).toEqual(all);
  });

  it("uses realtime tiers and never reads by id without an id", () => {
    expect(pendingProposalsQuery(CASE_ID)).toMatchObject({
      staleTime: STALE_REALTIME,
      gcTime: GC_REALTIME,
    });
    expect(proposalByIdQuery(CASE_ID, null).enabled).toBe(false);
    expect(proposalByIdQuery(CASE_ID, testId(1)).enabled).toBe(true);
  });

  it("asks for one small first page of pending Proposals and reads the count from its total", async () => {
    listProposalsPageFn.mockResolvedValueOnce({
      items: [{ id: testId(1) }],
      nextCursor: "cursor-1",
      total: { count: 1000, isCapped: true },
    });
    const client = new QueryClient();
    const options = pendingProposalsQuery(CASE_ID);
    const summary = await client.query(options);
    expect(listProposalsPageFn).toHaveBeenLastCalledWith({
      data: { caseId: CASE_ID, status: ["pending"], limit: 12 },
    });
    expect(summary).toEqual({
      items: [{ id: testId(1) }],
      count: 1000,
      countLabel: "1000+",
    });
  });

  it("reads the queue a page at a time with the view's params and the cursor", async () => {
    const proposal = (n: number) => ({ id: testId(n) });
    listProposalsPageFn
      .mockResolvedValueOnce({
        items: [proposal(1)],
        nextCursor: "cursor-1",
        total: { count: 2, isCapped: false },
      })
      .mockResolvedValueOnce({
        items: [proposal(2)],
        nextCursor: null,
        total: null,
      });
    const observer = new InfiniteQueryObserver(
      new QueryClient(),
      proposalListView.infinite(
        { caseId: CASE_ID },
        proposalList.queryOf({ status: ["pending"], q: "lead" })
      )
    );

    await observer.fetchNextPage();
    expect(listProposalsPageFn).toHaveBeenLastCalledWith({
      data: { caseId: CASE_ID, status: ["pending"], q: "lead" },
    });
    const second = await observer.fetchNextPage();
    expect(second.hasNextPage).toBe(false);
    expect(listProposalsPageFn).toHaveBeenLastCalledWith({
      data: {
        caseId: CASE_ID,
        status: ["pending"],
        q: "lead",
        cursor: "cursor-1",
      },
    });
  });
});
