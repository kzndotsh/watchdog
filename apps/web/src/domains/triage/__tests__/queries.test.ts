import { ORPCError } from "@orpc/client";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  pendingProposalsQuery,
  proposalByIdQuery,
  proposalListView,
} from "@/domains/triage/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { buildProposalQueueItem } from "@/testing/records";
import { proposalList } from "@watchdog/domain/schemas/jobs";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

const CASE_ID = testCaseId(10);

const queuePage = procedureDouble("proposals.queuePage");
const getProposal = procedureDouble("proposals.get");

describe("triage queries", () => {
  it("never reads a Proposal by id without an id", () => {
    expect(proposalByIdQuery(CASE_ID, null).enabled).toBe(false);
    expect(proposalByIdQuery(CASE_ID, testId(1)).enabled).toBe(true);
  });

  it("reads one Proposal by its Case and id, and a NOT_FOUND as null", async () => {
    getProposal.mockRejectedValueOnce(new ORPCError("NOT_FOUND"));
    const proposal = await new QueryClient().query(
      proposalByIdQuery(CASE_ID, testId(1))
    );
    expect(proposal).toBeNull();
    expect(getProposal).toHaveBeenLastCalledWith({
      caseId: CASE_ID,
      proposalId: testId(1),
    });
  });

  it("asks for one small first page of pending Proposals and reads the count from its total", async () => {
    const item = buildProposalQueueItem({ id: testId(1) });
    queuePage.mockResolvedValueOnce({
      items: [item],
      nextCursor: "cursor-1",
      total: { count: 1000, isCapped: true },
    });
    const summary = await new QueryClient().query(
      pendingProposalsQuery(CASE_ID)
    );
    expect(queuePage).toHaveBeenLastCalledWith({
      caseId: CASE_ID,
      status: ["pending"],
      limit: 12,
    });
    expect(summary).toEqual({
      items: [item],
      count: 1000,
      countLabel: "1000+",
    });
  });

  it("reads the queue a page at a time with the view's params and the cursor", async () => {
    queuePage
      .mockResolvedValueOnce({
        items: [buildProposalQueueItem({ id: testId(1) })],
        nextCursor: "cursor-1",
        total: { count: 2, isCapped: false },
      })
      .mockResolvedValueOnce({
        items: [buildProposalQueueItem({ id: testId(2) })],
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
    expect(queuePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        status: ["pending"],
        q: "lead",
      })
    );
    expect(queuePage.mock.lastCall?.[0]).not.toHaveProperty("cursor");
    const second = await observer.fetchNextPage();
    expect(second.hasNextPage).toBe(false);
    expect(queuePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        status: ["pending"],
        q: "lead",
        cursor: "cursor-1",
      })
    );
  });
});
